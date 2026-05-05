from decimal import Decimal

from rest_framework import serializers

from .models import (
    AcademicYear,
    Class,
    ClassSubjectCurriculum,
    Grade,
    Student,
    StudentEnrollment,
    Subject,
    Teacher,
    User,
)

_CURRENT_YEAR_CACHE = {"value": None, "loaded": False}


def _get_current_academic_year():
    if _CURRENT_YEAR_CACHE["loaded"]:
        return _CURRENT_YEAR_CACHE["value"]

    year = AcademicYear.objects.filter(is_current=True).order_by("-starts_on", "-id").first()
    _CURRENT_YEAR_CACHE["value"] = year
    _CURRENT_YEAR_CACHE["loaded"] = True
    return year


def get_subject_plan_for_student(student):
    cached_plan = getattr(student, "_subject_plan_cache", None)
    if cached_plan is not None:
        return cached_plan

    student_class = student.get_current_class()
    academic_year = student.get_current_academic_year() or _get_current_academic_year()

    if not student_class:
        student._subject_plan_cache = []
        return student._subject_plan_cache

    cache_key = (student_class.id, academic_year.id if academic_year else None)
    request_cache = getattr(student, "_subject_plan_request_cache", None)
    if request_cache is not None:
        cached_by_class_year = request_cache.get(cache_key)
        if cached_by_class_year is not None:
            student._subject_plan_cache = cached_by_class_year
            return student._subject_plan_cache

    curriculum_qs = ClassSubjectCurriculum.objects.select_related("subject").filter(
        student_class=student_class,
        is_active=True,
    )
    curriculum_qs = curriculum_qs.select_related("subject__teacher__user")
    if academic_year:
        curriculum_qs = curriculum_qs.filter(academic_year=academic_year)
    else:
        curriculum_qs = curriculum_qs.filter(academic_year__is_current=True)

    curriculum_items = list(curriculum_qs.order_by("subject__name"))
    if curriculum_items:
        entries = []
        for item in curriculum_items:
            coefficient = item.coefficient_override if item.coefficient_override is not None else item.subject.coefficient
            entries.append(
                {
                    "subject": item.subject,
                    "coefficient": Decimal(coefficient),
                    "is_required": item.is_required,
                }
            )
        student._subject_plan_cache = entries
        if request_cache is not None:
            request_cache[cache_key] = entries
        return student._subject_plan_cache

    subjects = Subject.objects.select_related("teacher__user").filter(subject_class=student_class).order_by("name")
    student._subject_plan_cache = [
        {
            "subject": subject,
            "coefficient": Decimal(subject.coefficient),
            "is_required": True,
        }
        for subject in subjects
    ]
    if request_cache is not None:
        request_cache[cache_key] = student._subject_plan_cache
    return student._subject_plan_cache


def get_required_subjects_for_student(student):
    return [item["subject"] for item in get_subject_plan_for_student(student) if item["is_required"]]


def _get_current_grade_map(student):
    cached_map = getattr(student, "_current_grade_map_cache", None)
    if cached_map is not None:
        return cached_map

    prefetched_grades = getattr(student, "_prefetched_current_grades", None)
    grades = prefetched_grades if prefetched_grades is not None else Grade.objects.filter(student=student, period="current")

    grade_map = {}
    for grade in grades:
        if grade.subject_id is not None:
            grade_map[grade.subject_id] = grade

    student._current_grade_map_cache = grade_map
    return student._current_grade_map_cache


def compute_student_metrics(student, subject_scope_ids=None):
    scope_key = None
    if subject_scope_ids is not None:
        scope_key = tuple(sorted(subject_scope_ids))

    cache_map = getattr(student, "_computed_metrics_cache_map", None)
    if cache_map is None:
        cache_map = {}
        student._computed_metrics_cache_map = cache_map

    if scope_key in cache_map:
        return cache_map[scope_key]

    subject_plan = get_subject_plan_for_student(student)
    required_items = [item for item in subject_plan if item["is_required"]]
    if subject_scope_ids is not None:
        required_items = [
            item for item in required_items if item["subject"].id in subject_scope_ids
        ]

    weighted_sum = Decimal("0")
    weight_total = Decimal("0")
    all_notes_present = bool(required_items)
    grade_map = _get_current_grade_map(student)
    incomplete_subjects = []

    for item in required_items:
        subject = item["subject"]
        coefficient = Decimal(item["coefficient"])
        grade = grade_map.get(subject.id)

        if not grade or grade.grade_value is None:
            all_notes_present = False
            teacher_name = "Aucun enseignant"
            if subject.teacher and subject.teacher.user:
                teacher_name = f"{subject.teacher.user.first_name} {subject.teacher.user.last_name}".strip()
            incomplete_subjects.append(
                {
                    "subject_id": subject.id,
                    "subject_name": subject.name,
                    "teacher_name": teacher_name,
                }
            )
            continue

        weighted_sum += Decimal(grade.grade_value) * coefficient
        weight_total += coefficient

    weighted_average = None
    if weight_total > 0:
        weighted_average = (weighted_sum / weight_total).quantize(Decimal("0.01"))

    metrics = {
        "all_notes_present": all_notes_present,
        "weighted_average": weighted_average,
        "incomplete_subjects": incomplete_subjects,
    }
    cache_map[scope_key] = metrics
    return metrics


def compute_weighted_average(student):
    metrics = compute_student_metrics(student)
    return metrics["weighted_average"]


def sync_student_enrollment(student, academic_year=None):
    selected_year = academic_year or _get_current_academic_year()
    if not selected_year:
        return None

    if student.student_class is None and student.study_year is None:
        return None

    enrollment_defaults = {
        "student_class": student.student_class,
        "study_year": student.study_year,
        "is_active": bool(selected_year.is_current),
    }
    enrollment, _ = StudentEnrollment.objects.update_or_create(
        student=student,
        academic_year=selected_year,
        defaults=enrollment_defaults,
    )

    if enrollment.is_active:
        StudentEnrollment.objects.filter(student=student).exclude(id=enrollment.id).update(is_active=False)
    return enrollment


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "first_name", "last_name", "email", "role", "phone"]


class ClassSerializer(serializers.ModelSerializer):
    class Meta:
        model = Class
        fields = ["id", "name"]


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ["id", "code", "label", "starts_on", "ends_on", "is_current"]


class TeacherSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="user_id", read_only=True)
    user = UserSerializer(read_only=True)
    first_name = serializers.CharField(write_only=True, required=False)
    last_name = serializers.CharField(write_only=True, required=False)
    email = serializers.EmailField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False, allow_blank=False, trim_whitespace=False)
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Teacher
        fields = [
            "id",
            "user",
            "ssn",
            "speciality",
            "first_name",
            "last_name",
            "email",
            "password",
            "phone",
        ]

    def create(self, validated_data):
        first_name = validated_data.pop("first_name", None)
        last_name = validated_data.pop("last_name", None)
        email = validated_data.pop("email", None)
        password = validated_data.pop("password", None)
        if not first_name or not last_name or not email or not password:
            raise serializers.ValidationError(
                "first_name, last_name, email et password sont obligatoires pour creer un enseignant."
            )
        phone = validated_data.pop("phone", "")

        user = User.objects.create_user(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            role="teacher",
            phone=phone or None,
        )
        return Teacher.objects.create(user=user, **validated_data)

    def update(self, instance, validated_data):
        user = instance.user
        for field in ["first_name", "last_name", "email", "phone"]:
            if field in validated_data:
                setattr(user, field, validated_data.pop(field))

        password = validated_data.pop("password", None)
        if password:
            user.set_password(password)
        user.save()

        for field in ["ssn", "speciality"]:
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        return instance


class StudentSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="user_id", read_only=True)
    user = UserSerializer(read_only=True)
    class_name = serializers.SerializerMethodField()
    all_notes_present = serializers.SerializerMethodField()
    weighted_average = serializers.SerializerMethodField()
    incomplete_subjects = serializers.SerializerMethodField()
    current_academic_year = serializers.SerializerMethodField()

    first_name = serializers.CharField(write_only=True, required=False)
    last_name = serializers.CharField(write_only=True, required=False)
    email = serializers.EmailField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False, allow_blank=False, trim_whitespace=False)
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    student_class = serializers.PrimaryKeyRelatedField(queryset=Class.objects.all(), required=False, allow_null=True)
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False, allow_null=True, write_only=True)

    class Meta:
        model = Student
        fields = [
            "id",
            "user",
            "student_number",
            "study_year",
            "student_class",
            "class_name",
            "academic_year",
            "current_academic_year",
            "guardian_name",
            "guardian_phone",
            "birth_date",
            "all_notes_present",
            "weighted_average",
            "incomplete_subjects",
            "first_name",
            "last_name",
            "email",
            "password",
            "phone",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not self._include_metrics():
            self.fields.pop("all_notes_present", None)
            self.fields.pop("weighted_average", None)
            self.fields.pop("incomplete_subjects", None)

    def _include_metrics(self):
        cached = getattr(self, "_include_metrics_cache", None)
        if cached is not None:
            return cached

        include_metrics = self.context.get("include_metrics")
        if include_metrics is None:
            request = self.context.get("request")
            if request is not None:
                raw_value = request.query_params.get("include_metrics")
                if raw_value is not None:
                    include_metrics = str(raw_value).strip().lower() in {"1", "true", "yes", "on"}

        if include_metrics is None:
            include_metrics = True

        self._include_metrics_cache = bool(include_metrics)
        return self._include_metrics_cache

    def create(self, validated_data):
        first_name = validated_data.pop("first_name", None)
        last_name = validated_data.pop("last_name", None)
        email = validated_data.pop("email", None)
        password = validated_data.pop("password", None)
        academic_year = validated_data.pop("academic_year", None)
        if not first_name or not last_name or not email or not password:
            raise serializers.ValidationError(
                "first_name, last_name, email et password sont obligatoires pour creer un etudiant."
            )
        phone = validated_data.pop("phone", "")

        user = User.objects.create_user(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            role="student",
            phone=phone or None,
        )
        student = Student.objects.create(user=user, **validated_data)
        sync_student_enrollment(student, academic_year=academic_year)
        return student

    def update(self, instance, validated_data):
        user = instance.user
        academic_year = validated_data.pop("academic_year", None)
        for field in ["first_name", "last_name", "email", "phone"]:
            if field in validated_data:
                setattr(user, field, validated_data.pop(field))

        password = validated_data.pop("password", None)
        if password:
            user.set_password(password)
        user.save()

        for field in [
            "student_number",
            "study_year",
            "student_class",
            "guardian_name",
            "guardian_phone",
            "birth_date",
        ]:
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        sync_student_enrollment(instance, academic_year=academic_year)
        return instance

    def get_class_name(self, obj):
        current_class = obj.get_current_class()
        return current_class.name if current_class else "Non assignee"

    def _get_teacher_subject_scope_ids(self):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None):
            return None
        if getattr(request.user, "role", None) != "teacher":
            return None

        cached = getattr(self, "_teacher_subject_scope_ids_cache", None)
        if cached is not None:
            return cached

        subject_ids = set(
            Subject.objects.filter(teacher__user_id=request.user.id).values_list("id", flat=True)
        )
        self._teacher_subject_scope_ids_cache = subject_ids
        return subject_ids

    def _student_metrics_for_request(self, obj):
        teacher_subject_ids = self._get_teacher_subject_scope_ids()
        if teacher_subject_ids is None:
            return compute_student_metrics(obj)
        return compute_student_metrics(obj, subject_scope_ids=teacher_subject_ids)

    def get_current_academic_year(self, obj):
        current_year = obj.get_current_academic_year()
        return current_year.code if current_year else None

    def get_all_notes_present(self, obj):
        if not self._include_metrics():
            return None
        metrics = self._student_metrics_for_request(obj)
        return metrics["all_notes_present"]

    def get_weighted_average(self, obj):
        if not self._include_metrics():
            return None
        metrics = self._student_metrics_for_request(obj)
        avg = metrics["weighted_average"]
        return str(avg) if avg is not None else None

    def get_incomplete_subjects(self, obj):
        if not self._include_metrics():
            return []
        request = self.context.get("request")
        if request and getattr(request.user, "role", None) == "teacher":
            return []

        metrics = self._student_metrics_for_request(obj)
        return metrics["incomplete_subjects"]


class StudentEnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    class_name = serializers.SerializerMethodField()
    academic_year_code = serializers.SerializerMethodField()

    class Meta:
        model = StudentEnrollment
        fields = [
            "id",
            "student",
            "student_name",
            "academic_year",
            "academic_year_code",
            "student_class",
            "class_name",
            "study_year",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_student_name(self, obj):
        return f"{obj.student.user.first_name} {obj.student.user.last_name}"

    def get_class_name(self, obj):
        return obj.student_class.name if obj.student_class else None

    def get_academic_year_code(self, obj):
        return obj.academic_year.code if obj.academic_year else None


class SubjectSerializer(serializers.ModelSerializer):
    teacher_name = serializers.SerializerMethodField()
    class_name = serializers.SerializerMethodField()
    teacher = serializers.PrimaryKeyRelatedField(queryset=Teacher.objects.all(), required=False, allow_null=True)
    subject_class = serializers.PrimaryKeyRelatedField(queryset=Class.objects.all(), required=False, allow_null=True)

    class Meta:
        model = Subject
        fields = [
            "id",
            "name",
            "coefficient",
            "teacher",
            "subject_class",
            "teacher_name",
            "class_name",
        ]

    def get_teacher_name(self, obj):
        if obj.teacher:
            return f"{obj.teacher.user.first_name} {obj.teacher.user.last_name}"
        return "Aucun enseignant"

    def get_class_name(self, obj):
        if obj.subject_class:
            return obj.subject_class.name
        return "Aucune classe"


class ClassSubjectCurriculumSerializer(serializers.ModelSerializer):
    class_name = serializers.SerializerMethodField()
    subject_name = serializers.SerializerMethodField()
    academic_year_code = serializers.SerializerMethodField()

    class Meta:
        model = ClassSubjectCurriculum
        fields = [
            "id",
            "student_class",
            "class_name",
            "academic_year",
            "academic_year_code",
            "subject",
            "subject_name",
            "coefficient_override",
            "is_required",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_class_name(self, obj):
        return obj.student_class.name if obj.student_class else None

    def get_subject_name(self, obj):
        return obj.subject.name if obj.subject else None

    def get_academic_year_code(self, obj):
        return obj.academic_year.code if obj.academic_year else None


class GradeSerializer(serializers.ModelSerializer):
    subject_name = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    class_name = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    period = serializers.CharField(required=False, default="current")

    class Meta:
        model = Grade
        fields = [
            "id",
            "student",
            "subject",
            "subject_name",
            "student_name",
            "class_name",
            "grade_value",
            "status",
            "grade_type",
            "period",
            "date_recorded",
        ]
        read_only_fields = ["id", "subject_name", "student_name", "class_name", "status", "date_recorded"]

    def validate_grade_value(self, value):
        if value is None:
            return value
        if value < 0 or value > 20:
            raise serializers.ValidationError("La note doit etre entre 0 et 20.")
        return value

    def validate(self, attrs):
        period = attrs.get("period", "current")
        student = attrs.get("student", getattr(self.instance, "student", None))
        subject = attrs.get("subject", getattr(self.instance, "subject", None))

        if student and subject:
            existing = Grade.objects.filter(student=student, subject=subject, period=period)
            if self.instance:
                existing = existing.exclude(id=self.instance.id)
            if existing.exists():
                raise serializers.ValidationError(
                    "Une note finale existe deja pour cet etudiant, cette matiere et cette periode."
                )
        return attrs

    def get_subject_name(self, obj):
        return obj.subject.name if obj.subject else None

    def get_student_name(self, obj):
        if not obj.student:
            return None
        return f"{obj.student.user.first_name} {obj.student.user.last_name}"

    def get_class_name(self, obj):
        if obj.student:
            current_class = obj.student.get_current_class()
            if current_class:
                return current_class.name
        return None

    def get_status(self, obj):
        if obj.grade_value is None:
            return None
        return "pass" if Decimal(obj.grade_value) >= Decimal("10") else "failed"
