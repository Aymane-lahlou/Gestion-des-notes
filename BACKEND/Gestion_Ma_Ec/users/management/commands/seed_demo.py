from decimal import Decimal
from datetime import date

from django.core.management.base import BaseCommand

from users.models import (
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


class Command(BaseCommand):
    help = "Genere des donnees de demonstration (admin, enseignant, etudiants, matieres, notes)."

    def handle(self, *args, **options):
        admin_user, created = User.objects.get_or_create(
            email="admin@ecole.ma",
            defaults={
                "first_name": "Admin",
                "last_name": "Principal",
                "role": "admin",
                "is_staff": True,
                "is_superuser": True,
            },
        )
        admin_user.set_password("Admin123!")
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.role = "admin"
        admin_user.save()
        self.stdout.write(self.style.SUCCESS("Admin pret: admin@ecole.ma / Admin123!"))

        teacher_user, _ = User.objects.get_or_create(
            email="enseignant@ecole.ma",
            defaults={
                "first_name": "Karim",
                "last_name": "Lahlou",
                "role": "teacher",
            },
        )
        teacher_user.set_password("Teacher123!")
        teacher_user.role = "teacher"
        teacher_user.save()

        teacher = Teacher.objects.filter(user=teacher_user).first()
        if not teacher:
            teacher = Teacher.objects.filter(ssn="TCH-0001").select_related("user").first()
            if teacher:
                teacher_user = teacher.user
                teacher_user.role = "teacher"
                teacher_user.set_password("Teacher123!")
                teacher_user.save()
            else:
                teacher = Teacher.objects.create(
                    user=teacher_user,
                    ssn="TCH-0001",
                    speciality="Mathematiques",
                )
        if not teacher.speciality:
            teacher.speciality = "Mathematiques"
            teacher.save(update_fields=["speciality"])
        self.stdout.write(
            self.style.SUCCESS(f"Enseignant pret: {teacher_user.email} / Teacher123!")
        )

        class_a, _ = Class.objects.get_or_create(name="2eme Science")
        class_b, _ = Class.objects.get_or_create(name="1ere Science")
        current_year, _ = AcademicYear.objects.get_or_create(
            code="2025-2026",
            defaults={
                "label": "Annee scolaire 2025-2026",
                "starts_on": date(2025, 9, 1),
                "ends_on": date(2026, 7, 15),
                "is_current": True,
            },
        )
        if not current_year.is_current:
            AcademicYear.objects.filter(is_current=True).exclude(id=current_year.id).update(is_current=False)
            current_year.is_current = True
            current_year.save(update_fields=["is_current"])

        student1 = self._ensure_student(
            email="etudiant1@ecole.ma",
            password="Student123!",
            first_name="Aymane",
            last_name="Naji",
            student_number="STD-0001",
            study_year=2,
            student_class=class_a,
            academic_year=current_year,
            guardian_name="Parent Naji",
            guardian_phone="0600000001",
        )
        student2 = self._ensure_student(
            email="etudiant2@ecole.ma",
            password="Student123!",
            first_name="Salma",
            last_name="Amrani",
            student_number="STD-0002",
            study_year=2,
            student_class=class_a,
            academic_year=current_year,
            guardian_name="Parent Amrani",
            guardian_phone="0600000002",
        )
        student3 = self._ensure_student(
            email="etudiant3@ecole.ma",
            password="Student123!",
            first_name="Youssef",
            last_name="El Idrissi",
            student_number="STD-0003",
            study_year=1,
            student_class=class_b,
            academic_year=current_year,
            guardian_name="Parent Idrissi",
            guardian_phone="0600000003",
        )
        self.stdout.write(self.style.SUCCESS("Etudiants prets (mot de passe commun: Student123!)"))

        math, _ = Subject.objects.get_or_create(
            name="Mathematiques",
            subject_class=class_a,
            defaults={"coefficient": Decimal("3.00"), "teacher": teacher},
        )
        math.teacher = teacher
        math.coefficient = Decimal("3.00")
        math.save()

        physics, _ = Subject.objects.get_or_create(
            name="Physique",
            subject_class=class_a,
            defaults={"coefficient": Decimal("2.00"), "teacher": teacher},
        )
        physics.teacher = teacher
        physics.coefficient = Decimal("2.00")
        physics.save()

        chem, _ = Subject.objects.get_or_create(
            name="Chimie",
            subject_class=class_b,
            defaults={"coefficient": Decimal("2.00"), "teacher": teacher},
        )
        chem.teacher = teacher
        chem.coefficient = Decimal("2.00")
        chem.save()

        for cls, subjects in (
            (class_a, [math, physics]),
            (class_b, [chem]),
        ):
            for subject in subjects:
                ClassSubjectCurriculum.objects.update_or_create(
                    student_class=cls,
                    academic_year=current_year,
                    subject=subject,
                    defaults={
                        "coefficient_override": subject.coefficient,
                        "is_required": True,
                        "is_active": True,
                    },
                )

        demo_grades = [
            (student1, math, Decimal("16.50")),
            (student1, physics, Decimal("14.00")),
            (student2, math, Decimal("9.50")),
            (student2, physics, Decimal("12.00")),
            (student3, chem, Decimal("11.00")),
        ]

        for student, subject, value in demo_grades:
            Grade.objects.update_or_create(
                student=student,
                subject=subject,
                period="current",
                defaults={
                    "grade_type": "final",
                    "grade_value": value,
                },
            )

        self.stdout.write(self.style.SUCCESS("Notes de demonstration creees/mises a jour."))

    def _ensure_student(
        self,
        *,
        email,
        password,
        first_name,
        last_name,
        student_number,
        study_year,
        student_class,
        academic_year,
        guardian_name,
        guardian_phone,
    ):
        user, _ = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "role": "student",
            },
        )
        user.first_name = first_name
        user.last_name = last_name
        user.role = "student"
        user.set_password(password)
        user.save()

        student = Student.objects.filter(user=user).first()
        if not student:
            student = Student.objects.filter(student_number=student_number).first()
            if not student:
                student = Student.objects.create(
                    user=user,
                    student_number=student_number,
                    study_year=study_year,
                    student_class=student_class,
                    guardian_name=guardian_name,
                    guardian_phone=guardian_phone,
                )
                StudentEnrollment.objects.update_or_create(
                    student=student,
                    academic_year=academic_year,
                    defaults={
                        "student_class": student_class,
                        "study_year": study_year,
                        "is_active": True,
                    },
                )
                return student

        student.student_number = student_number
        student.study_year = study_year
        student.student_class = student_class
        student.guardian_name = guardian_name
        student.guardian_phone = guardian_phone
        student.save()
        enrollment, _ = StudentEnrollment.objects.update_or_create(
            student=student,
            academic_year=academic_year,
            defaults={
                "student_class": student_class,
                "study_year": study_year,
                "is_active": True,
            },
        )
        StudentEnrollment.objects.filter(student=student).exclude(id=enrollment.id).update(is_active=False)
        return student
