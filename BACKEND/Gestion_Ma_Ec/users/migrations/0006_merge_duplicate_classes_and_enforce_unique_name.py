from django.db import migrations, models
from django.db.models import Count


def merge_duplicate_classes(apps, schema_editor):
    Class = apps.get_model("users", "Class")
    Student = apps.get_model("users", "Student")
    Subject = apps.get_model("users", "Subject")
    StudentEnrollment = apps.get_model("users", "StudentEnrollment")
    ClassSubjectCurriculum = apps.get_model("users", "ClassSubjectCurriculum")

    duplicate_names = (
        Class.objects.values("name")
        .annotate(class_count=Count("id"))
        .filter(class_count__gt=1)
    )

    for item in duplicate_names:
        name = item["name"]
        class_ids = list(Class.objects.filter(name=name).order_by("id").values_list("id", flat=True))
        if len(class_ids) < 2:
            continue

        kept_class_id = class_ids[0]
        duplicate_ids = class_ids[1:]

        for duplicate_id in duplicate_ids:
            duplicate_curriculum_rows = ClassSubjectCurriculum.objects.filter(student_class_id=duplicate_id)
            for row in duplicate_curriculum_rows.iterator():
                existing = ClassSubjectCurriculum.objects.filter(
                    student_class_id=kept_class_id,
                    academic_year_id=row.academic_year_id,
                    subject_id=row.subject_id,
                ).first()

                if existing:
                    dirty = False
                    if row.is_required and not existing.is_required:
                        existing.is_required = True
                        dirty = True
                    if row.is_active and not existing.is_active:
                        existing.is_active = True
                        dirty = True
                    if existing.coefficient_override is None and row.coefficient_override is not None:
                        existing.coefficient_override = row.coefficient_override
                        dirty = True
                    if dirty:
                        existing.save(
                            update_fields=["is_required", "is_active", "coefficient_override", "updated_at"]
                        )
                    row.delete()
                else:
                    row.student_class_id = kept_class_id
                    row.save(update_fields=["student_class", "updated_at"])

            Student.objects.filter(student_class_id=duplicate_id).update(student_class_id=kept_class_id)
            Subject.objects.filter(subject_class_id=duplicate_id).update(subject_class_id=kept_class_id)
            StudentEnrollment.objects.filter(student_class_id=duplicate_id).update(student_class_id=kept_class_id)

            Class.objects.filter(id=duplicate_id).delete()


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0005_academicyear_classsubjectcurriculum_and_more"),
    ]

    operations = [
        migrations.RunPython(merge_duplicate_classes, noop_reverse),
        migrations.AlterField(
            model_name="class",
            name="name",
            field=models.CharField(max_length=50, unique=True),
        ),
    ]
