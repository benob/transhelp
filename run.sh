#!/bin/bash
#trap "kill %1" SIGINT SIGTERM EXIT

#~favre/prefix/packages/redis-2.0.0-rc2/redis-server redis.conf >> log/redis.log 2>&1 &
export NODE_PATH=./lib/multipart-js/lib
export PATH=$PATH:~favre/prefix/bin
export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:~favre/prefix/lib
node server.js | tee -a log/node.log
