# Hestia proxy template (HTTP) for simplefood.kozyr.info. The domain forces
# HTTPS (nginx.forcessl.conf), so in practice everything here redirects.
server {
    listen      %ip%:%proxy_port%;
    server_name %domain_idn% %alias_idn%;

    location / {
        proxy_pass http://127.0.0.1:3000;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;
    }

    include %home%/%user%/conf/web/%domain%/nginx.forcessl.conf*;
    include %home%/%user%/conf/web/%domain%/nginx.conf_*;

    error_log  /var/log/nginx/%domain%.error.log;
    access_log /var/log/nginx/%domain%.log;
}
