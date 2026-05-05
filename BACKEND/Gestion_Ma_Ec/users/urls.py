from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    AcademicYearViewSet,
    BulletinPDFAPIView,
    ClassAverageAPIView,
    ClassPassRateAPIView,
    ClassViewSet,
    CurriculumViewSet,
    GradeViewSet,
    LoginAPIView,
    LogoutAPIView,
    MeAPIView,
    RefreshAPIView,
    SendGradesWebhookBulkAPIView,
    SendGradesWebhookAPIView,
    StudentAverageAPIView,
    StudentEnrollmentViewSet,
    StudentViewSet,
    SubjectViewSet,
    TeacherViewSet,
)

router = DefaultRouter()
router.register('academic-years', AcademicYearViewSet, basename='academic_year')
router.register('classes', ClassViewSet, basename='class')
router.register('teachers', TeacherViewSet, basename='teacher')
router.register('students', StudentViewSet, basename='student')
router.register('student-enrollments', StudentEnrollmentViewSet, basename='student_enrollment')
router.register('subjects', SubjectViewSet, basename='subject')
router.register('curriculum', CurriculumViewSet, basename='curriculum')
router.register('grades', GradeViewSet, basename='grade')

urlpatterns = [
    path('auth/login/', LoginAPIView.as_view(), name='auth_login'),
    path('auth/refresh/', RefreshAPIView.as_view(), name='auth_refresh'),
    path('auth/me/', MeAPIView.as_view(), name='auth_me'),
    path('auth/logout/', LogoutAPIView.as_view(), name='auth_logout'),
    path('stats/student/<int:student_id>/average/', StudentAverageAPIView.as_view(), name='student_average'),
    path('stats/class/<int:class_id>/average/', ClassAverageAPIView.as_view(), name='class_average'),
    path('stats/class/<int:class_id>/pass-rate/', ClassPassRateAPIView.as_view(), name='class_pass_rate'),
    path('bulletins/student/<int:student_id>/pdf/', BulletinPDFAPIView.as_view(), name='bulletin_pdf'),
    path('admin/send-grades/bulk/', SendGradesWebhookBulkAPIView.as_view(), name='send_grades_webhook_bulk'),
    path('admin/send-grades/<int:student_id>/', SendGradesWebhookAPIView.as_view(), name='send_grades_webhook'),
]

urlpatterns += router.urls
