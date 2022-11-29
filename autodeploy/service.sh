#!/bin/bash
# service.sh, 2015-10-23 Tuomas Starck / Meetin.gs

_decrypt() {
  cat autodeploy/$1 | \
  timeout -k 5 5 ssh -Ti /root/id_keeper keeper@10.0.0.1 | \
  tee ${1%.asc}
}

setup_service() {
  TAG=${1:-srv}

  echo " *** $TAG: Setting up service configuration"
  install -m 0644 -p $DEPLOYDIR/$INTENT.conf /etc/init/
  install -m 0644 -p $DEPLOYDIR/$INTENT-instance.conf /etc/init/

  echo " *** $TAG: Create configuration link"
  ln -sf ${RANK}.js settings/index.js

  if [[ $RANK == beta ]] || [[ $RANK == live ]]; then
    for FILE in $(cd autodeploy; find files -type f); do
      mkdir -p $(dirname $FILE)
      _decrypt $FILE
    done
  fi

  echo " *** $TAG: Starting servive"
  service $INTENT restart
}
