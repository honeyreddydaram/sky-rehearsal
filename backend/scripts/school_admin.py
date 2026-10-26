"""Trusted operator bootstrap only; public clients cannot create schools or admins."""
import argparse
import re
import firebase_admin
from firebase_admin import auth, firestore

parser = argparse.ArgumentParser(description="Create a school and enroll its initial administrator")
parser.add_argument("project")
parser.add_argument("school")
parser.add_argument("uid")
parser.add_argument("name")
args = parser.parse_args()
if not all(re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value) for value in [args.school, args.uid]):
    parser.error("Use school/account IDs with letters, numbers, underscores or hyphens")
if not args.name.strip() or len(args.name) > 80:
    parser.error("Name must contain 1–80 characters")
app = firebase_admin.initialize_app(options={"projectId": args.project})
user = auth.get_user(args.uid, app=app)
claims = dict(user.custom_claims or {})
claims["role"] = "school_admin"
auth.set_custom_user_claims(user.uid, claims, app=app)
db = firestore.client(app=app)
ref = db.collection("schools").document(args.school)
ref.set({"name": args.name.strip()}, merge=True)
ref.collection("members").document(user.uid).set({"name": args.name.strip(), "role": "school_admin", "instructorUid": None, "active": True})
print("School administrator enrolled. Sign in again to refresh the trusted role.")
