from unittest.mock import Mock, patch

from decimal import Decimal
from datetime import date

from django.db import IntegrityError
from rest_framework import status
from rest_framework.test import APITestCase

from .models import AcademicYear, Class, ClassSubjectCurriculum, Grade, Student, StudentEnrollment, Subject, Teacher, User


class NotesApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin@test.com",
            password="Admin123!",
            first_name="Admin",
            last_name="Root",
            role="admin",
            is_staff=True,
            is_superuser=True,
        )
        self.teacher_user = User.objects.create_user(
            email="teacher@test.com",
            password="Teacher123!",
            first_name="Prof",
            last_name="Math",
            role="teacher",
        )
        self.teacher = Teacher.objects.create(user=self.teacher_user, ssn="T-001", speciality="Math")
        self.second_teacher_user = User.objects.create_user(
            email="teacher2@test.com",
            password="Teacher123!",
            first_name="Prof",
            last_name="Bio",
            role="teacher",
        )
        self.second_teacher = Teacher.objects.create(user=self.second_teacher_user, ssn="T-002", speciality="Biologie")

        self.class_a = Class.objects.create(name="2eme Science")
        self.class_b = Class.objects.create(name="1ere Science")
        self.current_year = AcademicYear.objects.create(
            code="2025-2026",
            label="Annee 2025-2026",
            starts_on=date(2025, 9, 1),
            ends_on=date(2026, 7, 15),
            is_current=True,
        )

        self.student1_user = User.objects.create_user(
            email="student1@test.com",
            password="Student123!",
            first_name="Alpha",
            last_name="One",
            role="student",
        )
        self.student1 = Student.objects.create(
            user=self.student1_user,
            student_number="S-001",
            study_year=2,
            student_class=self.class_a,
        )

        self.student2_user = User.objects.create_user(
            email="student2@test.com",
            password="Student123!",
            first_name="Beta",
            last_name="Two",
            role="student",
        )
        self.student2 = Student.objects.create(
            user=self.student2_user,
            student_number="S-002",
            study_year=2,
            student_class=self.class_a,
        )

        self.other_student_user = User.objects.create_user(
            email="student3@test.com",
            password="Student123!",
            first_name="Gamma",
            last_name="Three",
            role="student",
        )
        self.other_student = Student.objects.create(
            user=self.other_student_user,
            student_number="S-003",
            study_year=1,
            student_class=self.class_b,
        )

        StudentEnrollment.objects.create(
            student=self.student1,
            academic_year=self.current_year,
            student_class=self.class_a,
            study_year=2,
            is_active=True,
        )
        StudentEnrollment.objects.create(
            student=self.student2,
            academic_year=self.current_year,
            student_class=self.class_a,
            study_year=2,
            is_active=True,
        )
        StudentEnrollment.objects.create(
            student=self.other_student,
            academic_year=self.current_year,
            student_class=self.class_b,
            study_year=1,
            is_active=True,
        )

        self.math = Subject.objects.create(
            name="Mathematiques",
            coefficient=Decimal("2.00"),
            teacher=self.teacher,
            subject_class=self.class_a,
        )
        self.physics = Subject.objects.create(
            name="Physique",
            coefficient=Decimal("1.00"),
            teacher=self.teacher,
            subject_class=self.class_a,
        )
        self.biology = Subject.objects.create(
            name="Biologie",
            coefficient=Decimal("1.00"),
            teacher=self.second_teacher,
            subject_class=self.class_a,
        )
        ClassSubjectCurriculum.objects.create(
            student_class=self.class_a,
            academic_year=self.current_year,
            subject=self.math,
            coefficient_override=Decimal("2.00"),
            is_required=True,
            is_active=True,
        )
        ClassSubjectCurriculum.objects.create(
            student_class=self.class_a,
            academic_year=self.current_year,
            subject=self.physics,
            coefficient_override=Decimal("1.00"),
            is_required=True,
            is_active=True,
        )
        ClassSubjectCurriculum.objects.create(
            student_class=self.class_a,
            academic_year=self.current_year,
            subject=self.biology,
            coefficient_override=Decimal("1.00"),
            is_required=True,
            is_active=True,
        )

        Grade.objects.create(
            student=self.student1,
            subject=self.math,
            grade_value=Decimal("14.00"),
            grade_type="final",
            period="current",
        )
        Grade.objects.create(
            student=self.student1,
            subject=self.physics,
            grade_value=Decimal("10.00"),
            grade_type="final",
            period="current",
        )
        Grade.objects.create(
            student=self.student2,
            subject=self.math,
            grade_value=Decimal("8.00"),
            grade_type="final",
            period="current",
        )
        Grade.objects.create(
            student=self.student2,
            subject=self.physics,
            grade_value=Decimal("9.00"),
            grade_type="final",
            period="current",
        )

    def login(self, email, password):
        response = self.client.post("/api/auth/login/", {"email": email, "password": password}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data["access"], response.data["refresh"]

    def authorize(self, email, password):
        access, _ = self.login(email, password)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def test_login_success_returns_tokens_and_user(self):
        response = self.client.post(
            "/api/auth/login/",
            {"email": "admin@test.com", "password": "Admin123!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["role"], "admin")

    def test_login_invalid_credentials(self):
        response = self.client.post(
            "/api/auth/login/",
            {"email": "admin@test.com", "password": "bad"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_requires_token(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_profile_with_token(self):
        self.authorize("student1@test.com", "Student123!")
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "student1@test.com")
        self.assertEqual(response.data["role"], "student")

    def test_student_cannot_create_grade(self):
        self.authorize("student1@test.com", "Student123!")
        response = self.client.post(
            "/api/grades/",
            {
                "student": self.student1_user.id,
                "subject": self.math.id,
                "grade_value": 13,
                "grade_type": "final",
                "period": "retake",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_can_create_grade_for_own_subject(self):
        self.authorize("teacher@test.com", "Teacher123!")
        response = self.client.post(
            "/api/grades/",
            {
                "student": self.other_student_user.id,
                "subject": self.math.id,
                "grade_value": 11,
                "grade_type": "final",
                "period": "current",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            "/api/grades/",
            {
                "student": self.student1_user.id,
                "subject": self.math.id,
                "grade_value": 15,
                "grade_type": "final",
                "period": "retake",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_teacher_sees_only_students_in_his_subject_classes(self):
        self.authorize("teacher@test.com", "Teacher123!")
        response = self.client.get("/api/students/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {item["id"] for item in response.data}
        self.assertIn(self.student1_user.id, returned_ids)
        self.assertIn(self.student2_user.id, returned_ids)
        self.assertNotIn(self.other_student_user.id, returned_ids)

    def test_teacher_student_payload_hides_missing_subject_details_and_uses_teacher_scope(self):
        self.authorize("teacher@test.com", "Teacher123!")
        response = self.client.get("/api/students/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        student_payload = next(item for item in response.data if item["id"] == self.student1_user.id)
        self.assertEqual(student_payload["incomplete_subjects"], [])
        self.assertTrue(student_payload["all_notes_present"])
        self.assertEqual(student_payload["weighted_average"], "12.67")

    def test_admin_student_payload_keeps_missing_subject_details(self):
        self.authorize("admin@test.com", "Admin123!")
        response = self.client.get("/api/students/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        student_payload = next(item for item in response.data if item["id"] == self.student1_user.id)
        self.assertFalse(student_payload["all_notes_present"])
        missing_subject_names = [item["subject_name"] for item in student_payload["incomplete_subjects"]]
        self.assertIn("Biologie", missing_subject_names)

    def test_student_list_filter_by_academic_year(self):
        self.authorize("admin@test.com", "Admin123!")
        response = self.client.get(f"/api/students/?academic_year={self.current_year.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {item["id"] for item in response.data}
        self.assertIn(self.student1_user.id, returned_ids)
        self.assertIn(self.student2_user.id, returned_ids)
        self.assertIn(self.other_student_user.id, returned_ids)

    def test_class_name_must_be_unique(self):
        Class.objects.create(name="Classe Unique")
        with self.assertRaises(IntegrityError):
            Class.objects.create(name="Classe Unique")

    def test_grade_must_be_between_0_and_20(self):
        self.authorize("admin@test.com", "Admin123!")
        response = self.client.post(
            "/api/grades/",
            {
                "student": self.student1_user.id,
                "subject": self.math.id,
                "grade_value": 25,
                "grade_type": "final",
                "period": "retake",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unique_grade_per_student_subject_and_period(self):
        self.authorize("admin@test.com", "Admin123!")
        response = self.client.post(
            "/api/grades/",
            {
                "student": self.student1_user.id,
                "subject": self.math.id,
                "grade_value": 16,
                "grade_type": "final",
                "period": "current",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_status_is_computed_from_grade_value(self):
        self.authorize("admin@test.com", "Admin123!")
        response = self.client.post(
            "/api/grades/",
            {
                "student": self.student1_user.id,
                "subject": self.math.id,
                "grade_value": 6,
                "grade_type": "final",
                "period": "retake",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = Grade.objects.get(id=response.data["id"])
        self.assertEqual(created.status, "failed")

    def test_status_response_uses_grade_value_even_if_db_status_is_stale(self):
        grade = Grade.objects.filter(student=self.student1, subject=self.math, period="current").first()
        Grade.objects.filter(id=grade.id).update(status="failed", grade_value=Decimal("18.00"))

        self.authorize("admin@test.com", "Admin123!")
        response = self.client.get("/api/grades/?student={}&subject={}&period=current".format(self.student1_user.id, self.math.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["grade_value"], "18.00")
        self.assertEqual(response.data[0]["status"], "pass")

    def test_weighted_average_endpoint(self):
        self.authorize("admin@test.com", "Admin123!")
        response = self.client.get(f"/api/stats/student/{self.student1_user.id}/average/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["average"], "12.67")
        self.assertEqual(response.data["status"], "pass")

    def test_class_stats_endpoints(self):
        self.authorize("admin@test.com", "Admin123!")
        avg_response = self.client.get(f"/api/stats/class/{self.class_a.id}/average/")
        pass_response = self.client.get(f"/api/stats/class/{self.class_a.id}/pass-rate/")
        self.assertEqual(avg_response.status_code, status.HTTP_200_OK)
        self.assertEqual(pass_response.status_code, status.HTTP_200_OK)
        self.assertEqual(avg_response.data["average"], "10.50")
        self.assertEqual(pass_response.data["pass_rate"], "50.00")

    def test_student_cannot_access_other_student_bulletin(self):
        self.authorize("student1@test.com", "Student123!")
        response = self.client.get(f"/api/bulletins/student/{self.student2_user.id}/pdf/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_download_bulletin_pdf(self):
        self.authorize("admin@test.com", "Admin123!")
        response = self.client.get(f"/api/bulletins/student/{self.student1_user.id}/pdf/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")

    @patch("users.views.requests.post")
    @patch("users.views.os.getenv")
    def test_admin_can_send_grades_webhook(self, mock_getenv, mock_post):
        mock_getenv.side_effect = lambda key, default=None: {
            "N8N_WEBHOOK_URL": "http://localhost:5678/webhook/test",
            "N8N_WEBHOOK_SECRET": "secret-token",
        }.get(key, default)

        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response
        Grade.objects.create(
            student=self.student1,
            subject=self.biology,
            grade_value=Decimal("14.00"),
            grade_type="final",
            period="current",
        )

        self.authorize("admin@test.com", "Admin123!")
        response = self.client.post(f"/api/admin/send-grades/{self.student1_user.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("Webhook n8n declenche", response.data["message"])
        mock_post.assert_called_once()

    @patch("users.views.requests.post")
    @patch("users.views.os.getenv")
    def test_admin_bulk_send_grades_success(self, mock_getenv, mock_post):
        mock_getenv.side_effect = lambda key, default=None: {
            "N8N_WEBHOOK_URL": "http://localhost:5678/webhook/test",
            "N8N_WEBHOOK_SECRET": "secret-token",
        }.get(key, default)

        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response

        Grade.objects.create(
            student=self.student1,
            subject=self.biology,
            grade_value=Decimal("12.00"),
            grade_type="final",
            period="current",
        )
        Grade.objects.create(
            student=self.student2,
            subject=self.biology,
            grade_value=Decimal("11.00"),
            grade_type="final",
            period="current",
        )

        self.authorize("admin@test.com", "Admin123!")
        response = self.client.post(
            "/api/admin/send-grades/bulk/",
            {"student_ids": [self.student1_user.id, self.student2_user.id]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["requested"], 2)
        self.assertEqual(response.data["summary"]["sent"], 2)
        self.assertEqual(response.data["summary"]["failed"], 0)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertEqual(mock_post.call_count, 2)

    @patch("users.views.requests.post")
    @patch("users.views.os.getenv")
    def test_admin_bulk_send_grades_partial_success(self, mock_getenv, mock_post):
        mock_getenv.side_effect = lambda key, default=None: {
            "N8N_WEBHOOK_URL": "http://localhost:5678/webhook/test",
            "N8N_WEBHOOK_SECRET": "secret-token",
        }.get(key, default)

        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_post.return_value = mock_response

        Grade.objects.create(
            student=self.student1,
            subject=self.biology,
            grade_value=Decimal("15.00"),
            grade_type="final",
            period="current",
        )

        self.authorize("admin@test.com", "Admin123!")
        response = self.client.post(
            "/api/admin/send-grades/bulk/",
            {"student_ids": [self.student1_user.id, self.student2_user.id]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["requested"], 2)
        self.assertEqual(response.data["summary"]["sent"], 1)
        self.assertEqual(response.data["summary"]["failed"], 1)
        failed_items = [item for item in response.data["results"] if item["status"] == "failed"]
        self.assertEqual(len(failed_items), 1)
        self.assertEqual(failed_items[0]["student_id"], self.student2_user.id)
        self.assertEqual(failed_items[0]["reason"], "missing_subject_grades")
        self.assertEqual(mock_post.call_count, 1)

    def test_non_admin_cannot_bulk_send_grades(self):
        self.authorize("teacher@test.com", "Teacher123!")
        response = self.client.post(
            "/api/admin/send-grades/bulk/",
            {"student_ids": [self.student1_user.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_bulk_send_grades_requires_non_empty_student_ids(self):
        self.authorize("admin@test.com", "Admin123!")
        response = self.client.post(
            "/api/admin/send-grades/bulk/",
            {"student_ids": []},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
