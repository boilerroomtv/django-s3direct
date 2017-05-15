import json

from datetime import datetime, timedelta
from urllib.parse import unquote

from django.http import HttpResponse, HttpResponseNotFound, HttpResponseServerError, HttpResponseForbidden, \
    HttpResponseBadRequest
from django.views.decorators.http import require_POST
from django.conf import settings

from .utils import get_s3direct_destinations, get_aws_v4_signing_key, get_aws_v4_signature


@require_POST
def get_upload_params(request):
    """Authorises user and validates given file properties."""
    content_type = request.POST['type']
    filename = request.POST['name']

    dest = get_s3direct_destinations().get(request.POST['dest'])
    if not dest:
        return HttpResponseNotFound(json.dumps({'error': 'File destination does not exist.'}), content_type='application/json')

    # Validate request and destination config:
    allowed = dest.get('allowed')
    auth = dest.get('auth')
    key = dest.get('key')

    if auth and not auth(request.user):
        return HttpResponseForbidden(json.dumps({'error': 'Permission denied.'}), content_type='application/json')

    if (allowed and content_type not in allowed) and allowed != '*':
        return HttpResponseBadRequest(json.dumps({'error': 'Invalid file type (%s).' % content_type}), content_type='application/json')

    if not key:
        return HttpResponseServerError(json.dumps({'error': 'Missing destination path.'}), content_type='application/json')
    elif hasattr(key, '__call__'):
        object_key = key(filename)
    elif key == '/':
        # The literal string '${filename}' is an S3 field variable for key.
        # https://aws.amazon.com/articles/1434#aws-table
        object_key = '${filename}'
    else:
        object_key = '%s/${filename}' % key

    bucket = dest.get('bucket') or settings.AWS_STORAGE_BUCKET_NAME
    region = dest.get('region') or getattr(settings, 'S3DIRECT_REGION', None) or 'us-east-1'
    endpoint = 's3.amazonaws.com' if region == 'us-east-1' else ('s3-%s.amazonaws.com' % region)

    # AWS credentials are not required for publicly-writable buckets
    access_key_id = getattr(settings, 'AWS_ACCESS_KEY_ID', None)

    bucket_url = 'https://{0}/{1}'.format(endpoint, bucket)

    upload_data = {
        "key": object_key,
        # Evaporate-required:
        "access_key_id": access_key_id,
        "region": region,
        "bucket": bucket,
        'bucket_url': bucket_url,

        'content_type': content_type,
        'cache_control': dest.get('cache_control'),
        'content_disposition': dest.get('content_disposition'),
        'acl': dest.get('acl') or 'public-read',
    }
    return HttpResponse(json.dumps(upload_data), content_type='application/json')


@require_POST
def generate_aws_v4_signature(request):
    print(request.POST)
    message = unquote(request.POST['to_sign'])
    signing_date = datetime.strptime(request.POST['datetime'], '%Y%m%dT%H%M%SZ')
    signing_key = get_aws_v4_signing_key(settings.AWS_SECRET_ACCESS_KEY, signing_date, settings.S3DIRECT_REGION, 's3')
    signature = get_aws_v4_signature(signing_key, message)
    return HttpResponse(signature)
