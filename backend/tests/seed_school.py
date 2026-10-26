"""Synthetic browser-test accounts; refuses every non-local Firebase configuration."""
import json
import os
import uuid
import firebase_admin
from firebase_admin import auth, firestore, credentials
from google.auth.credentials import AnonymousCredentials

assert os.environ.get('FIREBASE_PROJECT_ID') == 'demo-sky-rehearsal'
assert os.environ.get('FIREBASE_AUTH_EMULATOR_HOST') == '127.0.0.1:9099'
assert os.environ.get('FIRESTORE_EMULATOR_HOST') == '127.0.0.1:8080'

class LocalCredentials(credentials.Base):
    def get_credential(self):
        return AnonymousCredentials()

application = firebase_admin.initialize_app(LocalCredentials(), options={'projectId':'demo-sky-rehearsal'})
suffix = uuid.uuid4().hex
password = 'Local-school-browser-test-123'
accounts = {}
for label, role in [('teacher','school_admin'),('student','student')]:
    email = f'{label}-{suffix}@example.test'
    user = auth.create_user(email=email, password=password, app=application)
    auth.set_custom_user_claims(user.uid, {'role':role}, app=application)
    accounts[label] = {'email':email,'uid':user.uid}
school = 'browser-' + suffix
ref = firestore.client(app=application).collection('schools').document(school)
ref.set({'name':'Synthetic browser school'})
ref.collection('members').document(accounts['teacher']['uid']).set({'name':'Test instructor','role':'school_admin','active':True,'instructorUid':None})
print(json.dumps({'school':school,'password':password,**accounts}))
