#!/bin/bash
# update.sh, 2015-03-02 Tuomas Starck / Meetin.gs
#
# Autodeployment (version 2) update hook for
# generic Node.js service upgrading.

set -u

end() {
  echo " *** update: Version has not changed, exiting"
  exit 0
}

. $DEPLOYDIR/githupdate.sh

git_upgrade && [ "$FORCE" != "yes" ] && end

. $DEPLOYDIR/service.sh

echo " *** update: Installing current dependencies"
npm install --production 2> /dev/null

setup_service "update"
