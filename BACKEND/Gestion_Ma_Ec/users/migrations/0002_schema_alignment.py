# Generated manually to align DB schema with current models.
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="groups",
            field=models.ManyToManyField(
                blank=True,
                help_text="The groups this user belongs to. A user will get all permissions granted to each of their groups.",
                related_name="user_set",
                related_query_name="user",
                to="auth.group",
                verbose_name="groups",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="user_permissions",
            field=models.ManyToManyField(
                blank=True,
                help_text="Specific permissions for this user.",
                related_name="user_set",
                related_query_name="user",
                to="auth.permission",
                verbose_name="user permissions",
            ),
        ),
        migrations.AddField(
            model_name="student",
            name="student_class",
            field=models.ForeignKey(
                blank=True,
                db_column="class_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to="users.class",
            ),
        ),
        migrations.AddField(
            model_name="subject",
            name="subject_class",
            field=models.ForeignKey(
                blank=True,
                db_column="class_id",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                to="users.class",
            ),
        ),
        migrations.AddField(
            model_name="subject",
            name="teacher",
            field=models.ForeignKey(
                blank=True,
                db_column="teacher_id",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to="users.teacher",
            ),
        ),
        migrations.AddField(
            model_name="grade",
            name="student",
            field=models.ForeignKey(
                blank=True,
                db_column="student_id",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                to="users.student",
            ),
        ),
        migrations.AddField(
            model_name="grade",
            name="subject",
            field=models.ForeignKey(
                blank=True,
                db_column="subject_id",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                to="users.subject",
            ),
        ),
    ]
