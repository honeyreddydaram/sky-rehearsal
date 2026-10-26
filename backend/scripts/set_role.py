"""Run only as a trusted operator with Firebase Auth administrative credentials."""
import argparse

import firebase_admin
from firebase_admin import auth

parser = argparse.ArgumentParser(description="Assign a trusted Firebase role to an existing account")
parser.add_argument("project")
parser.add_argument("uid")
parser.add_argument("role", choices=["student", "instructor", "school_admin", "platform_admin"])
args = parser.parse_args()
app = firebase_admin.initialize_app(options={"projectId": args.project})
user = auth.get_user(args.uid, app=app)
claims = dict(user.custom_claims or {})
claims["role"] = args.role
# Preserve unrelated claims; no role is assigned by public signup or client input.
auth.set_custom_user_claims(args.uid, claims, app=app)
print("Role updated. The user must sign in again to refresh their ID token.")
