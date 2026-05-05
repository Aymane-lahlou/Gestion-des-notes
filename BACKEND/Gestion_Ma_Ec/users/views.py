import base64
import os
from decimal import Decimal

from django.db.models import Prefetch, Q
from django.http import HttpResponse
from django.utils import timezone
import requests
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import AcademicYear, Class, ClassSubjectCurriculum, Grade, Student, StudentEnrollment, Subject, Teacher
from .serializers import (
    AcademicYearSerializer,
    ClassSerializer,
    ClassSubjectCurriculumSerializer,
    GradeSerializer,
    StudentEnrollmentSerializer,
    StudentSerializer,
    SubjectSerializer,
    TeacherSerializer,
    UserSerializer,
    compute_weighted_average,
    get_subject_plan_for_student,
)


def _escape_pdf_text(value):
    return str(value).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_simple_pdf(lines):
    escaped_lines = [_escape_pdf_text(line) for line in lines]

    content_parts = ["BT", "/F1 12 Tf", "50 780 Td"]
    for idx, line in enumerate(escaped_lines):
        if idx == 0:
            content_parts.append(f"({line}) Tj")
        else:
            content_parts.append("0 -18 Td")
            content_parts.append(f"({line}) Tj")
    content_parts.append("ET")

    stream = "\n".join(content_parts).encode("latin-1", "replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]

    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref_pos = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        pdf.extend(f"{off:010d} 00000 n \n".encode("ascii"))

    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode("ascii")
    )
    return bytes(pdf)


def _teacher_profile(user):
    try:
        return Teacher.objects.get(user=user)
    except Teacher.DoesNotExist:
        return None


def _student_profile(user):
    try:
        return Student.objects.select_related("student_class").prefetch_related(
            "enrollments__academic_year",
            "enrollments__student_class",
        ).get(user=user)
    except Student.DoesNotExist:
        return None


def _students_for_class(class_obj):
    return Student.objects.select_related("user", "student_class").prefetch_related(
        "enrollments__academic_year",
        "enrollments__student_class",
    ).filter(
        Q(student_class=class_obj)
        | Q(enrollments__student_class=class_obj, enrollments__is_active=True)
    ).distinct()


def _class_weighted_average(class_obj):
    students = _students_for_class(class_obj)
    values = []
    for student in students:
        avg = compute_weighted_average(student)
        if avg is not None:
            values.append(avg)
    if not values:
        return None
    return (sum(values) / Decimal(len(values))).quantize(Decimal("0.01"))


def _class_pass_rate(class_obj):
    students = _students_for_class(class_obj)
    total = 0
    passed = 0
    for student in students:
        avg = compute_weighted_average(student)
        if avg is None:
            continue
        total += 1
        if avg >= Decimal("10"):
            passed += 1
    if total == 0:
        return Decimal("0.00")
    return ((Decimal(passed) / Decimal(total)) * Decimal("100")).quantize(Decimal("0.01"))


def _validate_grade_links(student, subject):
    if not student or not subject:
        raise ValidationError("Etudiant et matiere sont obligatoires.")

    current_class = student.get_current_class()
    if not current_class:
        raise ValidationError("Cet etudiant n'est assigne a aucune classe.")
    if not subject.subject_class:
        raise ValidationError("Cette matiere n'est assignee a aucune classe.")
    if current_class.id != subject.subject_class_id:
        raise ValidationError("La matiere et l'etudiant doivent appartenir a la meme classe.")


def _is_truthy_query_param(value, default=True):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _student_grade_report_data(student):
    subject_plan = get_subject_plan_for_student(student)
    grades_data = []
    missing_subjects = []

    for item in subject_plan:
        subject = item["subject"]
        coefficient = item["coefficient"]
        is_required = item["is_required"]

        grade = Grade.objects.filter(student=student, subject=subject, period="current").first()
        if not grade or grade.grade_value is None:
            if is_required:
                missing_subjects.append(subject.name)
            continue

        current_status = "pass" if Decimal(grade.grade_value) >= Decimal("10") else "failed"
        grades_data.append(
            {
                "subject": subject.name,
                "subject_id": subject.id,
                "coefficient": str(coefficient),
                "grade": str(grade.grade_value),
                "status": current_status,
                "period": grade.period,
            }
        )

    return subject_plan, grades_data, missing_subjects


def _student_for_grade_dispatch(student_id):
    return Student.objects.select_related("user", "student_class").prefetch_related(
        "enrollments__academic_year",
        "enrollments__student_class",
    ).filter(user__id=student_id).first()


def _send_grade_report_for_student(student):
    current_class = student.get_current_class()
    if not current_class:
        return {
            "ok": False,
            "status_code": status.HTTP_400_BAD_REQUEST,
            "reason": "student_without_class",
            "error": "Etudiant sans classe.",
        }

    subject_plan, grades_data, missing_subjects = _student_grade_report_data(student)
    if not subject_plan:
        return {
            "ok": False,
            "status_code": status.HTTP_400_BAD_REQUEST,
            "reason": "no_subject_plan",
            "error": "Aucune matiere pour cette classe.",
        }
    if missing_subjects:
        return {
            "ok": False,
            "status_code": status.HTTP_400_BAD_REQUEST,
            "reason": "missing_subject_grades",
            "error": "Notes incompletes. Impossible d'envoyer le bulletin.",
            "missing_subjects": missing_subjects,
        }

    average = compute_weighted_average(student)
    status_label = None
    if average is not None:
        status_label = "pass" if average >= Decimal("10") else "failed"

    lines = [
        "Bulletin scolaire",
        f"Date de generation: {timezone.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        f"Etudiant: {student.user.first_name} {student.user.last_name}",
        f"Email: {student.user.email}",
        f"Classe: {current_class.name}",
        "",
        "Matieres:",
    ]
    for item in grades_data:
        lines.append(
            f"- {item['subject']} | coef {item['coefficient']} | note {item['grade']}/20 | statut {item['status']}"
        )
    lines.extend(
        [
            "",
            f"Moyenne generale (ponderee): {average if average is not None else 'N/A'}/20",
            f"Statut: {status_label if status_label else 'N/A'}",
        ]
    )

    pdf_bytes = _build_simple_pdf(lines)
    pdf_base64 = base64.b64encode(pdf_bytes).decode("ascii")

    webhook_url = os.getenv("N8N_WEBHOOK_URL")
    if not webhook_url:
        return {
            "ok": False,
            "status_code": status.HTTP_400_BAD_REQUEST,
            "reason": "webhook_url_missing",
            "error": "N8N_WEBHOOK_URL n'est pas configure dans l'environnement.",
        }

    payload = {
        "event": "grades_report_ready",
        "generated_at": timezone.now().isoformat(),
        "student": {
            "id": student.user.id,
            "first_name": student.user.first_name,
            "last_name": student.user.last_name,
            "email": student.user.email,
            "class_name": current_class.name,
        },
        "grades": grades_data,
        "average": str(average) if average is not None else None,
        "status": status_label,
        "pdf_filename": f"bulletin_{student.user.first_name}_{student.user.last_name}_{student.user.id}.pdf",
        "pdf_base64": pdf_base64,
    }

    headers = {"Content-Type": "application/json"}
    webhook_secret = os.getenv("N8N_WEBHOOK_SECRET")
    if webhook_secret:
        headers["X-Webhook-Secret"] = webhook_secret

    try:
        n8n_response = requests.post(webhook_url, json=payload, headers=headers, timeout=15)
        n8n_response.raise_for_status()
    except requests.RequestException as exc:
        return {
            "ok": False,
            "status_code": status.HTTP_502_BAD_GATEWAY,
            "reason": "webhook_request_failed",
            "error": f"Echec de communication avec n8n: {str(exc)}",
        }

    return {
        "ok": True,
        "status_code": status.HTTP_200_OK,
        "message": "Webhook n8n declenche avec succes pour l'envoi du bulletin.",
        "student_id": student.user.id,
        "class_name": current_class.name,
    }


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["email"] = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class LoginAPIView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class RefreshAPIView(TokenRefreshView):
    serializer_class = TokenRefreshSerializer


class MeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class LogoutAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = request.data.get("refresh")
        if refresh:
            try:
                token = RefreshToken(refresh)
                token.blacklist()
            except (AttributeError, TokenError):
                pass
        return Response({"message": "Deconnexion effectuee."}, status=status.HTTP_200_OK)


class _AdminWriteMixin:
    def _ensure_admin_write(self):
        if self.request.method not in {"GET", "HEAD", "OPTIONS"} and self.request.user.role != "admin":
            raise PermissionDenied("Seul l'administrateur peut modifier cette ressource.")

    def create(self, request, *args, **kwargs):
        self._ensure_admin_write()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._ensure_admin_write()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._ensure_admin_write()
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._ensure_admin_write()
        return super().destroy(request, *args, **kwargs)


class ClassViewSet(_AdminWriteMixin, viewsets.ModelViewSet):
    serializer_class = ClassSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Class.objects.all()

        if user.role == "admin":
            return qs
        if user.role == "teacher":
            return qs.filter(subject__teacher__user=user).distinct()
        if user.role == "student":
            student = _student_profile(user)
            if not student:
                return Class.objects.none()
            current_class = student.get_current_class()
            if not current_class:
                return Class.objects.none()
            return qs.filter(id=current_class.id)
        return Class.objects.none()


class AcademicYearViewSet(_AdminWriteMixin, viewsets.ModelViewSet):
    serializer_class = AcademicYearSerializer
    permission_classes = [IsAuthenticated]
    queryset = AcademicYear.objects.all()

    def get_queryset(self):
        return self.queryset.order_by("-starts_on", "-id")


class TeacherViewSet(_AdminWriteMixin, viewsets.ModelViewSet):
    serializer_class = TeacherSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Teacher.objects.select_related("user").all()
        if user.role == "admin":
            return qs
        if user.role == "teacher":
            return qs.filter(user=user)
        return Teacher.objects.none()


class StudentViewSet(_AdminWriteMixin, viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [IsAuthenticated]

    def _include_metrics(self):
        raw_value = self.request.query_params.get("include_metrics")
        return _is_truthy_query_param(raw_value, default=True)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        students = list(queryset)
        if self._include_metrics():
            shared_subject_plan_cache = {}
            for student in students:
                student._subject_plan_request_cache = shared_subject_plan_cache
        serializer = self.get_serializer(students, many=True)
        return Response(serializer.data)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["include_metrics"] = self._include_metrics()
        return context

    def get_queryset(self):
        user = self.request.user
        include_metrics = self._include_metrics()
        qs = Student.objects.select_related("user", "student_class").prefetch_related(
            Prefetch(
                "enrollments",
                queryset=StudentEnrollment.objects.select_related("academic_year", "student_class").order_by(
                    "-academic_year__starts_on",
                    "-id",
                ),
                to_attr="_prefetched_enrollments",
            ),
        )
        if include_metrics:
            qs = qs.prefetch_related(
                Prefetch(
                    "grade_set",
                    queryset=Grade.objects.select_related("subject").filter(period="current"),
                    to_attr="_prefetched_current_grades",
                )
            )
        needs_distinct = False

        if user.role == "admin":
            pass
        elif user.role == "teacher":
            teacher = _teacher_profile(user)
            if not teacher:
                return Student.objects.none()
            qs = qs.filter(
                Q(student_class__subject__teacher=teacher)
                | Q(enrollments__student_class__subject__teacher=teacher, enrollments__is_active=True)
            )
            needs_distinct = True
        elif user.role == "student":
            qs = qs.filter(user=user)
        else:
            return Student.objects.none()

        class_id = self.request.query_params.get("class")
        academic_year_id = self.request.query_params.get("academic_year")
        search = self.request.query_params.get("search")

        if class_id:
            qs = qs.filter(
                Q(student_class_id=class_id)
                | Q(enrollments__student_class_id=class_id, enrollments__is_active=True)
            )
            needs_distinct = True
        if academic_year_id:
            qs = qs.filter(enrollments__academic_year_id=academic_year_id)
            needs_distinct = True
        if search:
            qs = qs.filter(
                Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(student_number__icontains=search)
            )

        if needs_distinct:
            qs = qs.distinct()
        return qs


class StudentEnrollmentViewSet(_AdminWriteMixin, viewsets.ModelViewSet):
    serializer_class = StudentEnrollmentSerializer
    permission_classes = [IsAuthenticated]
    queryset = StudentEnrollment.objects.select_related("student__user", "student_class", "academic_year").all()

    def get_queryset(self):
        user = self.request.user
        qs = self.queryset
        if user.role == "admin":
            return qs
        if user.role == "teacher":
            teacher = _teacher_profile(user)
            if not teacher:
                return StudentEnrollment.objects.none()
            return qs.filter(student_class__subject__teacher=teacher).distinct()
        if user.role == "student":
            return qs.filter(student__user=user)
        return StudentEnrollment.objects.none()


class SubjectViewSet(_AdminWriteMixin, viewsets.ModelViewSet):
    serializer_class = SubjectSerializer
    permission_classes = [IsAuthenticated]
    queryset = Subject.objects.select_related("teacher__user", "subject_class").all()

    def get_queryset(self):
        user = self.request.user
        qs = self.queryset

        if user.role == "admin":
            pass
        elif user.role == "teacher":
            teacher = _teacher_profile(user)
            if not teacher:
                return Subject.objects.none()
            qs = qs.filter(teacher=teacher)
        elif user.role == "student":
            student = _student_profile(user)
            if not student:
                return Subject.objects.none()
            current_class = student.get_current_class()
            if not current_class:
                return Subject.objects.none()
            qs = qs.filter(subject_class=current_class)
        else:
            return Subject.objects.none()

        subject_id = self.request.query_params.get("subject")
        class_id = self.request.query_params.get("class")
        teacher_id = self.request.query_params.get("teacher")

        if subject_id:
            qs = qs.filter(id=subject_id)
        if class_id:
            qs = qs.filter(subject_class_id=class_id)
        if teacher_id:
            qs = qs.filter(teacher_id=teacher_id)
        return qs


class CurriculumViewSet(_AdminWriteMixin, viewsets.ModelViewSet):
    serializer_class = ClassSubjectCurriculumSerializer
    permission_classes = [IsAuthenticated]
    queryset = ClassSubjectCurriculum.objects.select_related("student_class", "academic_year", "subject").all()

    def get_queryset(self):
        user = self.request.user
        qs = self.queryset
        if user.role == "admin":
            pass
        elif user.role == "teacher":
            teacher = _teacher_profile(user)
            if not teacher:
                return ClassSubjectCurriculum.objects.none()
            qs = qs.filter(subject__teacher=teacher)
        elif user.role == "student":
            student = _student_profile(user)
            if not student:
                return ClassSubjectCurriculum.objects.none()
            current_class = student.get_current_class()
            current_year = student.get_current_academic_year()
            if not current_class:
                return ClassSubjectCurriculum.objects.none()
            qs = qs.filter(student_class=current_class)
            if current_year:
                qs = qs.filter(academic_year=current_year)
        else:
            return ClassSubjectCurriculum.objects.none()

        class_id = self.request.query_params.get("class")
        academic_year_id = self.request.query_params.get("academic_year")
        subject_id = self.request.query_params.get("subject")

        if class_id:
            qs = qs.filter(student_class_id=class_id)
        if academic_year_id:
            qs = qs.filter(academic_year_id=academic_year_id)
        if subject_id:
            qs = qs.filter(subject_id=subject_id)
        return qs


class GradeViewSet(viewsets.ModelViewSet):
    serializer_class = GradeSerializer
    permission_classes = [IsAuthenticated]
    queryset = Grade.objects.select_related(
        "student__user",
        "student__student_class",
        "subject",
        "subject__teacher",
    ).prefetch_related(
        Prefetch(
            "student__enrollments",
            queryset=StudentEnrollment.objects.select_related("academic_year", "student_class").order_by(
                "-academic_year__starts_on",
                "-id",
            ),
        )
    )

    def get_queryset(self):
        user = self.request.user
        qs = self.queryset
        requires_distinct = False

        if user.role == "admin":
            pass
        elif user.role == "teacher":
            teacher = _teacher_profile(user)
            if not teacher:
                return Grade.objects.none()
            qs = qs.filter(subject__teacher=teacher)
        elif user.role == "student":
            qs = qs.filter(student__user=user)
        else:
            return Grade.objects.none()

        student_id = self.request.query_params.get("student")
        subject_id = self.request.query_params.get("subject")
        class_id = self.request.query_params.get("class")
        period = self.request.query_params.get("period")
        search = self.request.query_params.get("search")
        academic_year_id = self.request.query_params.get("academic_year")

        if student_id:
            qs = qs.filter(student__user__id=student_id)
        if subject_id:
            qs = qs.filter(subject_id=subject_id)
        if class_id:
            qs = qs.filter(
                Q(student__student_class_id=class_id)
                | Q(student__enrollments__student_class_id=class_id, student__enrollments__is_active=True)
            )
            requires_distinct = True
        if academic_year_id:
            qs = qs.filter(student__enrollments__academic_year_id=academic_year_id)
            requires_distinct = True
        if period:
            qs = qs.filter(period=period)
        if search:
            qs = qs.filter(
                Q(student__user__first_name__icontains=search)
                | Q(student__user__last_name__icontains=search)
                | Q(student__student_number__icontains=search)
                | Q(student__user__email__icontains=search)
                | Q(subject__name__icontains=search)
            )
        if requires_distinct:
            qs = qs.distinct()
        return qs.order_by("-date_recorded")

    def _assert_teacher_can_manage_payload(self, student, subject):
        teacher = _teacher_profile(self.request.user)
        if not teacher:
            raise PermissionDenied("Profil enseignant introuvable.")
        if subject.teacher_id != teacher.user_id:
            raise PermissionDenied("Vous ne pouvez modifier que vos matieres.")
        current_class = student.get_current_class()
        if not current_class or subject.subject_class_id != current_class.id:
            raise ValidationError("L'etudiant ne correspond pas a la classe de cette matiere.")

    def perform_create(self, serializer):
        student = serializer.validated_data.get("student")
        subject = serializer.validated_data.get("subject")
        _validate_grade_links(student, subject)

        if self.request.user.role == "student":
            raise PermissionDenied("Les etudiants ne peuvent pas saisir des notes.")
        if self.request.user.role == "teacher":
            self._assert_teacher_can_manage_payload(student, subject)
        serializer.save()

    def perform_update(self, serializer):
        instance = self.get_object()
        student = serializer.validated_data.get("student", instance.student)
        subject = serializer.validated_data.get("subject", instance.subject)
        _validate_grade_links(student, subject)

        if self.request.user.role == "student":
            raise PermissionDenied("Les etudiants ne peuvent pas modifier des notes.")
        if self.request.user.role == "teacher":
            self._assert_teacher_can_manage_payload(student, subject)
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role == "student":
            raise PermissionDenied("Les etudiants ne peuvent pas supprimer des notes.")
        if self.request.user.role == "teacher":
            teacher = _teacher_profile(self.request.user)
            if not teacher or instance.subject.teacher_id != teacher.user_id:
                raise PermissionDenied("Suppression non autorisee.")
        instance.delete()


class StudentAverageAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        student = Student.objects.select_related("user", "student_class").prefetch_related(
            "enrollments__academic_year",
            "enrollments__student_class",
        ).filter(user__id=student_id).first()
        if not student:
            return Response({"error": "Etudiant introuvable."}, status=status.HTTP_404_NOT_FOUND)

        current_class = student.get_current_class()
        if request.user.role == "student" and request.user.id != student_id:
            raise PermissionDenied("Acces refuse.")
        if request.user.role == "teacher":
            teacher = _teacher_profile(request.user)
            if not teacher or not current_class or not Subject.objects.filter(subject_class=current_class, teacher=teacher).exists():
                raise PermissionDenied("Acces refuse.")

        avg = compute_weighted_average(student)
        if avg is None:
            return Response({"student_id": student_id, "average": None, "status": "incomplete"})

        return Response(
            {
                "student_id": student_id,
                "average": str(avg),
                "status": "pass" if avg >= Decimal("10") else "failed",
            }
        )


class ClassAverageAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        class_obj = Class.objects.filter(id=class_id).first()
        if not class_obj:
            return Response({"error": "Classe introuvable."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "student":
            student = _student_profile(request.user)
            if not student:
                raise PermissionDenied("Acces refuse.")
            current_class = student.get_current_class()
            if not current_class or current_class.id != class_id:
                raise PermissionDenied("Acces refuse.")
        if request.user.role == "teacher":
            teacher = _teacher_profile(request.user)
            if not teacher or not Subject.objects.filter(subject_class_id=class_id, teacher=teacher).exists():
                raise PermissionDenied("Acces refuse.")

        avg = _class_weighted_average(class_obj)
        return Response(
            {
                "class_id": class_obj.id,
                "class_name": class_obj.name,
                "average": str(avg) if avg is not None else None,
            }
        )


class ClassPassRateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, class_id):
        class_obj = Class.objects.filter(id=class_id).first()
        if not class_obj:
            return Response({"error": "Classe introuvable."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "student":
            student = _student_profile(request.user)
            if not student:
                raise PermissionDenied("Acces refuse.")
            current_class = student.get_current_class()
            if not current_class or current_class.id != class_id:
                raise PermissionDenied("Acces refuse.")
        if request.user.role == "teacher":
            teacher = _teacher_profile(request.user)
            if not teacher or not Subject.objects.filter(subject_class_id=class_id, teacher=teacher).exists():
                raise PermissionDenied("Acces refuse.")

        pass_rate = _class_pass_rate(class_obj)
        return Response(
            {
                "class_id": class_obj.id,
                "class_name": class_obj.name,
                "pass_rate": str(pass_rate),
            }
        )


class BulletinPDFAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        student = Student.objects.select_related("user", "student_class").prefetch_related(
            "enrollments__academic_year",
            "enrollments__student_class",
        ).filter(user__id=student_id).first()
        if not student:
            return Response({"error": "Etudiant introuvable."}, status=status.HTTP_404_NOT_FOUND)

        current_class = student.get_current_class()
        if not current_class:
            return Response({"error": "Etudiant sans classe."}, status=status.HTTP_400_BAD_REQUEST)

        if request.user.role == "student" and request.user.id != student_id:
            raise PermissionDenied("Acces refuse.")
        if request.user.role == "teacher":
            teacher = _teacher_profile(request.user)
            if not teacher or not Subject.objects.filter(subject_class=current_class, teacher=teacher).exists():
                raise PermissionDenied("Acces refuse.")

        subject_plan, grades_data, _ = _student_grade_report_data(student)
        if not subject_plan:
            return Response({"error": "Aucune matiere pour cette classe."}, status=status.HTTP_400_BAD_REQUEST)

        lines = [
            "Bulletin scolaire",
            f"Date de generation: {timezone.now().strftime('%Y-%m-%d %H:%M')}",
            "",
            f"Etudiant: {student.user.first_name} {student.user.last_name}",
            f"Email: {student.user.email}",
            f"Classe: {current_class.name}",
            "",
            "Matieres:",
        ]

        grades_by_subject = {item["subject_id"]: item for item in grades_data}
        for item in subject_plan:
            subject = item["subject"]
            grade_item = grades_by_subject.get(subject.id)
            value = grade_item["grade"] if grade_item else "N/A"
            status_label = grade_item["status"] if grade_item else "N/A"
            lines.append(
                f"- {subject.name} | coef {item['coefficient']} | note {value}/20 | statut {status_label}"
            )

        avg = compute_weighted_average(student)
        if avg is None:
            lines.extend(["", "Moyenne generale: Incomplete", "Statut: Incomplete"])
        else:
            lines.extend(
                [
                    "",
                    f"Moyenne generale (ponderee): {avg}/20",
                    f"Statut: {'pass' if avg >= Decimal('10') else 'failed'}",
                ]
            )

        pdf_bytes = _build_simple_pdf(lines)
        filename = f"bulletin_{student.user.first_name}_{student.user.last_name}_{student.user.id}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class SendGradesWebhookAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, student_id):
        if request.user.role != "admin":
            raise PermissionDenied("Seul l'administrateur peut declencher l'envoi des notes.")

        student = _student_for_grade_dispatch(student_id)
        if not student:
            return Response({"error": "Etudiant introuvable."}, status=status.HTTP_404_NOT_FOUND)

        result = _send_grade_report_for_student(student)
        if not result["ok"]:
            payload = {"error": result.get("error", "Echec de l'envoi.")}
            if "missing_subjects" in result:
                payload["missing_subjects"] = result["missing_subjects"]
            return Response(payload, status=result["status_code"])

        return Response({"message": result["message"]}, status=status.HTTP_200_OK)


class SendGradesWebhookBulkAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != "admin":
            raise PermissionDenied("Seul l'administrateur peut declencher l'envoi des notes.")

        raw_student_ids = request.data.get("student_ids")
        if not isinstance(raw_student_ids, list) or not raw_student_ids:
            return Response(
                {"error": "Le champ student_ids doit etre une liste non vide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student_ids = []
        seen_ids = set()
        for raw_id in raw_student_ids:
            try:
                student_id = int(raw_id)
            except (TypeError, ValueError):
                return Response(
                    {"error": "Chaque element de student_ids doit etre un entier valide."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if student_id <= 0:
                return Response(
                    {"error": "Chaque element de student_ids doit etre un entier strictement positif."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if student_id not in seen_ids:
                seen_ids.add(student_id)
                student_ids.append(student_id)

        students = Student.objects.select_related("user", "student_class").prefetch_related(
            "enrollments__academic_year",
            "enrollments__student_class",
        ).filter(user__id__in=student_ids)
        students_by_id = {student.user_id: student for student in students}

        sent_count = 0
        failed_count = 0
        results = []

        for student_id in student_ids:
            student = students_by_id.get(student_id)
            if not student:
                failed_count += 1
                results.append(
                    {
                        "student_id": student_id,
                        "status": "failed",
                        "reason": "student_not_found",
                        "error": "Etudiant introuvable.",
                    }
                )
                continue

            result = _send_grade_report_for_student(student)
            if result["ok"]:
                sent_count += 1
                results.append(
                    {
                        "student_id": student_id,
                        "status": "sent",
                        "message": result["message"],
                        "class_name": result.get("class_name"),
                    }
                )
                continue

            failed_count += 1
            item = {
                "student_id": student_id,
                "status": "failed",
                "reason": result.get("reason", "unknown_error"),
                "error": result.get("error", "Echec de l'envoi."),
            }
            if "missing_subjects" in result:
                item["missing_subjects"] = result["missing_subjects"]
            results.append(item)

        requested_count = len(student_ids)
        return Response(
            {
                "message": f"Envoi termine: {sent_count} envoyes, {failed_count} echecs.",
                "summary": {
                    "requested": requested_count,
                    "sent": sent_count,
                    "failed": failed_count,
                },
                "results": results,
            },
            status=status.HTTP_200_OK,
        )
