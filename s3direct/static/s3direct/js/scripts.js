var createHash = require('sha.js')
var Evaporate = require('evaporate');
var SparkMD5 = require('spark-md5');


console.log('Ayo');


(function () {

    "use strict"

    var getCookie = function (name) {
        var value = '; ' + document.cookie,
            parts = value.split('; ' + name + '=')
        if (parts.length == 2) return parts.pop().split(';').shift()
    }

    var request = function (method, url, data, headers, el, cb) {
        var req = new XMLHttpRequest()
        req.open(method, url, true)
        console.log(method + 'ing to', url, 'with data', data)

        Object.keys(headers).forEach(function (key) {
            req.setRequestHeader(key, headers[key])
        })

        req.onload = function () {
            cb(req.status, req.responseText)
        }

        req.onerror = req.onabort = function () {
            disableSubmit(false)
            error(el, 'Sorry, failed to upload file.')
        }

        req.send(data)
    }

    var parseNameFromUrl = function (url) {
        return decodeURIComponent((url + '').replace(/\+/g, '%20'));
    }

    var parseJson = function (json) {
        var data
        try {
            data = JSON.parse(json)
        }
        catch (e) {
            data = null
        }
        return data
    }

    var updateProgressBar = function (element, progressRatio) {
        var bar = element.querySelector('.bar');
        bar.style.width = Math.round(progressRatio * 100) + '%';
    }

    var error = function (el, msg) {
        el.className = 's3direct form-active'
        el.querySelector('.file-input').value = '';
        alert(msg)
    }

    var concurrentUploads = 0;

    var disableSubmit = function (status) {
        var submitRow = document.querySelector('.submit-row')
        if (!submitRow) return

        var buttons = submitRow.querySelectorAll('input[type=submit],button[type=submit]')

        if (status === true) concurrentUploads++
        else concurrentUploads--

        ;
        [].forEach.call(buttons, function (el) {
            el.disabled = (concurrentUploads !== 0)
        })
    };

    var beginUpload = function (element) {
        disableSubmit(true);
        element.className = 's3direct progress-active'
    };

    var finishUpload = function (element, object_key) {
        var link = element.querySelector('.file-link');
        var url = element.querySelector('.file-url');

        url.value = object_key;
        link.setAttribute('href', url.value);
        link.innerHTML = parseNameFromUrl(url.value).split('/').pop();

        element.className = 's3direct link-active';
        element.querySelector('.bar').style.width = '0%';
        disableSubmit(false);
    };

    var computeMd5 = function (data) {
        return btoa(SparkMD5.ArrayBuffer.hash(data, true));
    };

    var computeSha256 = function (data) {
        return createHash('sha256').update(data, 'utf-8').digest('hex');
    };

    var initiateMultipartUpload = function (element, signatureUrl, awsKey, awsRegion, awsBucket, objectKey, file) {
        console.log('Creating Evaporate instance...');
        console.log(signatureUrl, awsKey, awsRegion, awsBucket, objectKey, file);

        let generateAwsV4Signature = function (signParams, signHeaders, stringToSign, signatureDateTime, canonicalRequest) {
            return new Promise(function (resolve, reject) {
                const form = new FormData();
                console.log(stringToSign);
                console.log(signatureDateTime);
                form.append('to_sign', stringToSign);
                form.append('datetime', signatureDateTime);
                const headers = {'X-CSRFToken': getCookie('csrftoken')};
                request('POST', signatureUrl, form, headers, element, function (status, responseText) {
                    switch (status) {
                        case 200:
                            resolve(responseText);
                            break;
                        default:
                            error(element, 'Could not generate AWS v4 signature.')
                            reject();
                            break;
                    }
                });
            })
        };

        const ev = Evaporate.create(
            {
                //signerUrl: signatureUrl,
                customAuthMethod: generateAwsV4Signature,
                aws_key: awsKey,
                bucket: awsBucket,
                awsRegion: awsRegion,
                computeContentMd5: true,
                cryptoMd5Method: computeMd5,
                cryptoHexEncodedHash256: computeSha256,
                partSize: 20 * 1024 * 1024,
                logging: true,
                debug: true,
            }
        ).then(function (evaporate) {
            console.log('Evaporate created.');
            console.log('Evaporate supported?', evaporate.supported);
            console.log('dest:', objectKey);
            console.log('file:', file);
            beginUpload(element);
            evaporate.add({
                name: objectKey,
                file: file,
                contentType: file.contentType,
                progress: function (progressRatio, stats) { updateProgressBar(element, progressRatio); },
            }).then(
                function (awsS3ObjectKey) {
                    console.log('Successfully uploaded to:', awsS3ObjectKey);
                    finishUpload(element, awsS3ObjectKey);
                },
                function (reason) {
                    console.error('Failed to upload because:', reason);
                    return error(element, reason)
                }
            )
        });
    };


    var getUploadURLThenStartUpload = function (e) {
        console.log('Getting upload URL...');
        let el = e.target.parentElement,
            file = el.querySelector('.file-input').files[0],
            dest = el.querySelector('.file-dest').value,
            destinationCheckUrl = el.getAttribute('data-destination-url'),
            signatureUrl = el.getAttribute('data-signature-url'),
            form = new FormData(),
            headers = {'X-CSRFToken': getCookie('csrftoken')};

        form.append('type', file.type)
        form.append('name', file.name)
        form.append('dest', dest)

        request('POST', destinationCheckUrl, form, headers, el, function (status, response) {
            var uploadParameters = parseJson(response)
            console.log(uploadParameters)
            switch (status) {
                case 200:
                    initiateMultipartUpload(
                        el,
                        signatureUrl,
                        uploadParameters.access_key_id,
                        uploadParameters.region,
                        uploadParameters.bucket,
                        uploadParameters.key,
                        file
                    );
                    break;
                case 400:
                case 403:
                case 500:
                    error(el, uploadParameters.error);
                    break;
                default:
                    error(el, 'Sorry, could not get upload URL.');
            }
        })
    }

    var removeUpload = function (e) {
        e.preventDefault()

        var el = e.target.parentElement
        el.querySelector('.file-url').value = ''
        el.querySelector('.file-input').value = ''
        el.className = 's3direct form-active'
    }

    var addHandlers = function (el) {
        var url = el.querySelector('.file-url'),
            input = el.querySelector('.file-input'),
            remove = el.querySelector('.file-remove'),
            status = (url.value === '') ? 'form' : 'link'

        el.className = 's3direct ' + status + '-active'

        remove.addEventListener('click', removeUpload, false)
        input.addEventListener('change', getUploadURLThenStartUpload, false);
    }

    document.addEventListener('DOMContentLoaded', function (e) {
        //;
        [].forEach.call(document.querySelectorAll('.s3direct'), addHandlers)
    })

    document.addEventListener('DOMNodeInserted', function (e) {
        if (e.target.tagName) {
            var el = e.target.querySelectorAll('.s3direct');
            [].forEach.call(el, function (element, index, array) {
                addHandlers(element);
            });
        }
    })

})()
