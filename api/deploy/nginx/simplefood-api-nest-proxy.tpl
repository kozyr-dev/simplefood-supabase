# Hestia proxy template (HTTP) for api-simplefood.kozyr.info: HTTPS only.
# The Let's Encrypt challenge (nginx.conf_letsencrypt, a regex location, so
# it wins over `/`) still answers here, for certificate renewals.
server {
    listen      %ip%:%proxy_port%;
    server_name %domain_idn% %alias_idn%;

    location / {
        return 301 https://$host$request_uri;
    }

    include %home%/%user%/conf/web/%domain%/nginx.conf_*;

    error_log  /var/log/nginx/%domain%.error.log;
    access_log /var/log/nginx/%domain%.log;
}
