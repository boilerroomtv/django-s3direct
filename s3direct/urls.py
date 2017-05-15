from django.conf.urls import url
from s3direct.views import get_upload_params, generate_aws_v4_signature


urlpatterns = [
    url('^get_upload_params/', get_upload_params, name='s3direct'),
    url('^aws-v4-signature/', generate_aws_v4_signature, name='s3direct-signature'),
]
