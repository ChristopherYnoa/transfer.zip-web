#!/bin/bash

docker exec transferzip-web-mongo-1 mongosh \
  -u root -p $(grep MONGO_INITDB_ROOT_PASSWORD .env | cut -d= -f2) \
  --authenticationDatabase admin \
  transfer-zip \
  --quiet \
  --eval 'db.users.find({}, {email: 1, createdAt: 1, _id: 0}).sort({createdAt: 1}).forEach(u => print(u.email, "-", u.createdAt.toLocaleDateString()))'
