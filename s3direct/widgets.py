from __future__ import unicode_literals

import os
from django.conf import settings
from django.forms import widgets
from django.utils.safestring import mark_safe
from django.core.urlresolvers import reverse
from django.template.loader import render_to_string
from django.utils.http import urlunquote_plus

from s3direct.utils import get_s3direct_destinations


class S3DirectWidget(widgets.TextInput):

    class Media:
        js = (
            's3direct/js/bundled.js',
        )
        css = {
            'all': (
                's3direct/css/bootstrap-progress.min.css',
                's3direct/css/styles.css',
            )
        }

    def __init__(self, *args, **kwargs):
        self.dest_name = kwargs.pop('dest', None)
        self.dest = get_s3direct_destinations().get(self.dest_name)
        super(S3DirectWidget, self).__init__(*args, **kwargs)

    def render(self, name, value, attrs=None, **kwargs):
        tpl = os.path.join('s3direct', 's3direct-widget.tpl')
        output = render_to_string(tpl, {
            'name': name,
            'element_id': self.build_attrs(attrs).get('id', ''),
            'file_url': value or '',
            'file_name': os.path.basename(urlunquote_plus(value)) if value else '',
            'style': self.build_attrs(attrs).get('style', ''),
            'dest': self.dest_name,
            'destination_url': reverse('s3direct'),
            'signature_url': reverse('s3direct-signature'),
        })

        return mark_safe(output)
