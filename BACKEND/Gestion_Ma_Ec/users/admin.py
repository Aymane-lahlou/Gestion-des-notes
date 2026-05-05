from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

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


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    model = User
    ordering = ("id",)
    list_display = ("id", "email", "first_name", "last_name", "role", "is_staff", "is_active")
    list_filter = ("role", "is_staff", "is_active")
    search_fields = ("email", "first_name", "last_name")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "phone", "street_address", "city", "postal_code")}),
        ("Permissions", {"fields": ("role", "is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login",)}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "first_name", "last_name", "role", "password1", "password2", "is_staff", "is_active"),
            },
        ),
    )


@admin.register(Class)
class ClassAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "label", "starts_on", "ends_on", "is_current")
    list_filter = ("is_current",)
    search_fields = ("code", "label")


@admin.register(Teacher)
class TeacherAdmin(admin.ModelAdmin):
    list_display = ("user", "ssn", "speciality")
    search_fields = ("user__email", "user__first_name", "user__last_name", "ssn", "speciality")


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("user", "student_number", "study_year", "student_class")
    list_filter = ("study_year", "student_class")
    search_fields = ("user__email", "user__first_name", "user__last_name", "student_number")


@admin.register(StudentEnrollment)
class StudentEnrollmentAdmin(admin.ModelAdmin):
    list_display = ("id", "student", "academic_year", "student_class", "study_year", "is_active")
    list_filter = ("academic_year", "student_class", "is_active")
    search_fields = (
        "student__user__email",
        "student__user__first_name",
        "student__user__last_name",
        "student__student_number",
        "academic_year__code",
    )


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "coefficient", "teacher", "subject_class")
    list_filter = ("subject_class",)
    search_fields = ("name",)


@admin.register(ClassSubjectCurriculum)
class ClassSubjectCurriculumAdmin(admin.ModelAdmin):
    list_display = ("id", "student_class", "academic_year", "subject", "coefficient_override", "is_required", "is_active")
    list_filter = ("academic_year", "student_class", "is_required", "is_active")
    search_fields = ("student_class__name", "academic_year__code", "subject__name")


@admin.register(Grade)
class GradeAdmin(admin.ModelAdmin):
    list_display = ("id", "student", "subject", "grade_value", "status", "grade_type", "period", "date_recorded")
    list_filter = ("status", "grade_type", "period", "subject")
    search_fields = ("student__user__email", "student__student_number", "subject__name")
