"""Small operational boundaries for Cloud Run; no payloads or identities in app logs."""
import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from firebase_admin import firestore

LOGGER = logging.getLogger('sky')
LOGGER.setLevel(logging.INFO)
if not LOGGER.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(message)s'))
    LOGGER.addHandler(handler)
LOGGER.propagate = False

MAX_BODY = 2 * 1024 * 1024


def reserve_api_quota(application, uid, limit=60):
    db = firestore.client(app=application)
    ref = db.collection('_apiQuota').document(uid)
    window = int(time.time() // 60)
    @firestore.transactional
    def reserve(transaction):
        data = ref.get(transaction=transaction).to_dict() or {}
        count = data.get('count',0) if data.get('window') == window else 0
        if count >= limit:
            raise HTTPException(429,'Request limit reached; try again shortly',headers={'Retry-After':'60'})
        transaction.set(ref,{'window':window,'count':count+1,'expiresAt':datetime.now(timezone.utc)+timedelta(days=2)})
    try:
        reserve(db.transaction())
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503,'Request quota service unavailable') from None


class OperationsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope,receive,send)
        started = time.monotonic()
        request_id = uuid.uuid4().hex
        status = 500
        sent = False
        async def output(message):
            nonlocal status, sent
            if message['type'] == 'http.response.start':
                status = message['status']; sent = True
                message['headers'] = list(message.get('headers',[])) + [(b'x-request-id',request_id.encode()),(b'cache-control',b'no-store'),(b'x-content-type-options',b'nosniff'),(b'referrer-policy',b'no-referrer')]
            await send(message)
        async def error(code, detail):
            await output({'type':'http.response.start','status':code,'headers':[(b'content-type',b'application/json')]})
            await output({'type':'http.response.body','body':json.dumps({'detail':detail,'requestId':request_id}).encode()})
        try:
            body = bytearray()
            if scope['method'] in {'POST','PUT','PATCH'}:
                length = dict(scope.get('headers',[])).get(b'content-length')
                if length and (not length.isdigit() or int(length)>MAX_BODY):
                    return await error(413,'Request body exceeds 2 MB')
                while True:
                    message = await receive()
                    if message['type'] == 'http.disconnect':
                        return
                    chunk = message.get('body',b'')
                    if len(body)+len(chunk)>MAX_BODY:
                        return await error(413,'Request body exceeds 2 MB')
                    body.extend(chunk)
                    if not message.get('more_body'):
                        break
                delivered = False
                async def buffered():
                    nonlocal delivered
                    if not delivered:
                        delivered = True
                        return {'type':'http.request','body':bytes(body),'more_body':False}
                    return await receive()
                await self.app(scope,buffered,output)
            else:
                await self.app(scope,receive,output)
        except Exception as exception:
            LOGGER.error(json.dumps({'severity':'ERROR','event':'api_error','requestId':request_id,'errorType':type(exception).__name__}))
            if not sent:
                await error(503,'Service unavailable; retry or report this request ID')
            else:
                raise
        finally:
            route = getattr(scope.get('route'),'path','unmatched')
            LOGGER.info(json.dumps({'severity':'ERROR' if status>=500 else 'INFO','event':'api_request','requestId':request_id,'method':scope['method'],'route':route,'status':status,'elapsedMs':round((time.monotonic()-started)*1000)}))
