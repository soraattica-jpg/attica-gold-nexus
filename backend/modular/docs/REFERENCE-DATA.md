# Rates and pledge-place reference data

The six registrations at `server.js:23434–23463` and `server.js:27849–27859` are extracted into `modules/reference-data`. The module retains the original response shapes, query/body label handling, pledge-place fallback, and database adapter calls.

Port 3101 uses authenticated, process-local synthetic values. Mutations never reach MariaDB or production. Restarting `attica-api-next-preview.service` restores the fixtures, which the verifier checks explicitly.

Production remains unchanged. The generated runtime candidate injects the original MariaDB rate queries and existing pledge-place readers/writers, but startup remains disabled.
