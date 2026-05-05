from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'admin')
        return self.create_user(email, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    id = models.AutoField(primary_key=True)
    ROLE_CHOICES = (
        ('admin', 'Admin'),
        ('teacher', 'Teacher'),
        ('student', 'Student'),
    )

    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    email = models.EmailField(unique=True, max_length=100)
    phone = models.CharField(max_length=20, null=True, blank=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    street_address = models.CharField(max_length=255, null=True, blank=True)
    city = models.CharField(max_length=100, null=True, blank=True)
    postal_code = models.CharField(max_length=10, null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name', 'role']

    class Meta:
        db_table = 'users'


class Class(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = 'classes'


class AcademicYear(models.Model):
    id = models.AutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True)
    label = models.CharField(max_length=50)
    starts_on = models.DateField()
    ends_on = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        db_table = 'academic_years'
        ordering = ['-starts_on', '-id']


class Teacher(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True)
    ssn = models.CharField(max_length=20, unique=True)
    speciality = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        db_table = 'teachers'


class Student(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True)
    student_number = models.CharField(max_length=20, unique=True)
    study_year = models.IntegerField(null=True, blank=True)
    student_class = models.ForeignKey(Class, on_delete=models.SET_NULL, null=True, blank=True, db_column='class_id')
    guardian_name = models.CharField(max_length=100, null=True, blank=True)
    guardian_phone = models.CharField(max_length=20, null=True, blank=True)
    birth_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'students'

    def get_current_enrollment(self):
        prefetched = getattr(self, "_prefetched_enrollments", None)
        if prefetched is None:
            prefetched_cache = getattr(self, "_prefetched_objects_cache", {})
            prefetched = prefetched_cache.get("enrollments")
        if prefetched is not None:
            for enrollment in prefetched:
                if enrollment.is_active and enrollment.academic_year and enrollment.academic_year.is_current:
                    return enrollment
            for enrollment in prefetched:
                if enrollment.is_active:
                    return enrollment
            return None

        current = self.enrollments.select_related('academic_year', 'student_class').filter(
            is_active=True,
            academic_year__is_current=True,
        ).first()
        if current:
            return current
        return self.enrollments.select_related('academic_year', 'student_class').filter(is_active=True).first()

    def get_current_class(self):
        enrollment = self.get_current_enrollment()
        if enrollment and enrollment.student_class:
            return enrollment.student_class
        return self.student_class

    def get_current_study_year(self):
        enrollment = self.get_current_enrollment()
        if enrollment and enrollment.study_year is not None:
            return enrollment.study_year
        return self.study_year

    def get_current_academic_year(self):
        enrollment = self.get_current_enrollment()
        if enrollment:
            return enrollment.academic_year
        return None


class StudentEnrollment(models.Model):
    id = models.AutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='enrollments', db_column='student_id')
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='enrollments',
        db_column='academic_year_id',
    )
    student_class = models.ForeignKey(
        Class,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='enrollments',
        db_column='class_id',
    )
    study_year = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'student_enrollments'
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'academic_year'],
                name='uniq_enrollment_student_year',
            ),
        ]
        ordering = ['-academic_year__starts_on', '-id']


class Subject(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100)
    coefficient = models.DecimalField(max_digits=3, decimal_places=2, default=1.00)
    teacher = models.ForeignKey(Teacher, on_delete=models.SET_NULL, null=True, blank=True, db_column='teacher_id')
    subject_class = models.ForeignKey(Class, on_delete=models.CASCADE, null=True, blank=True, db_column='class_id')

    class Meta:
        db_table = 'subjects'


class ClassSubjectCurriculum(models.Model):
    id = models.AutoField(primary_key=True)
    student_class = models.ForeignKey(
        Class,
        on_delete=models.CASCADE,
        related_name='curriculum_items',
        db_column='class_id',
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='curriculum_items',
        db_column='academic_year_id',
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name='curriculum_items',
        db_column='subject_id',
    )
    coefficient_override = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    is_required = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'class_subject_curriculum'
        constraints = [
            models.UniqueConstraint(
                fields=['student_class', 'academic_year', 'subject'],
                name='uniq_curriculum_class_year_subject',
            ),
        ]
        ordering = ['student_class_id', 'academic_year_id', 'subject_id']


class Grade(models.Model):
    id = models.AutoField(primary_key=True)
    GRADE_TYPES = (
        ('final', 'Final'),
        ('exam', 'Exam'),
        ('assignment', 'Assignment'),
        ('quiz', 'Quiz'),
    )
    STATUS_CHOICES = (
        ('pass', 'Pass'),
        ('failed', 'Failed'),
    )
    student = models.ForeignKey(Student, on_delete=models.CASCADE, db_column='student_id', null=True, blank=True)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, db_column='subject_id', null=True, blank=True)
    grade_value = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(20)],
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, null=True, blank=True)
    grade_type = models.CharField(max_length=20, choices=GRADE_TYPES, default='final')
    period = models.CharField(max_length=20, default='current')
    date_recorded = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'grades'
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'subject', 'period'],
                name='uniq_grade_student_subject_period',
            ),
        ]

    def save(self, *args, **kwargs):
        if self.grade_value is None:
            self.status = None
        else:
            self.status = 'pass' if Decimal(self.grade_value) >= Decimal('10') else 'failed'
        super().save(*args, **kwargs)
