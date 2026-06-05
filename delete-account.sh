#!/bin/bash

read -p "Email to delete: " email

docker exec transferzip-web-mongo-1 mongosh \
  -u root -p $(grep MONGO_INITDB_ROOT_PASSWORD .env | cut -d= -f2) \
  --authenticationDatabase admin \
  transfer-zip \
  --quiet \
  --eval "const r = db.users.deleteOne({email: '${email}'}); print(r.deletedCount ? 'Account deleted: ${email}' : 'No account found for: ${email}')"
