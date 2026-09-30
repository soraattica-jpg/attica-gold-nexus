#!/bin/bash
mysql -u root asterisk -e "UPDATE attica_calls SET status='completed' WHERE status='active' AND created_at < NOW() - INTERVAL 1 HOUR;"
