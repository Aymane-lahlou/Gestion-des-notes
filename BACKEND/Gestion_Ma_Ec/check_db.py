import os
import sys
import django
from django.db import connection

# Set up Django environment
sys.path.append(r"C:\Users\hp\Desktop\gg\Projet\Gestion de notes\BACKEND\Gestion_Ma_Ec")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "Gestion_Ma_Ec.settings")
django.setup()

def check_db():
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW TABLES;")
            tables = [row[0] for row in cursor.fetchall()]
            print("=== TABLES IN DATABASE ===")
            for t in tables:
                print(f"- {t}")
            
            if 'users' in tables:
                cursor.execute("SHOW CREATE TABLE users;")
                create_stmt = cursor.fetchone()[1]
                print("\n=== USERS TABLE SCHEMA ===")
                print(create_stmt)
            else:
                print("\nWARNING: 'users' table DOES NOT EXIST!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_db()
