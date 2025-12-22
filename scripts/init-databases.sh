#!/bin/bash
# Creates all databases needed for SafetySecretary development
# This script runs automatically on first postgres container initialization

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE safetysecretary_registry'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'safetysecretary_registry')\gexec

    SELECT 'CREATE DATABASE safetysecretary_demo'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'safetysecretary_demo')\gexec
EOSQL

echo "Databases initialized: safetysecretary, safetysecretary_registry, safetysecretary_demo"
