# Meetin.gs async backend gearman workers

npm install
ln -sf local.js settings/index.js
node worker.js --test_function=test_js_worker --parameters='{"test":1}'

# Updating push certificate files

For each certificate open the Keychain Access program and use Certificate Assistant to Request Certificate From Certificate Authority. Fill in the first email and leave the second email empty. This creates a .certSigningRequest file which you upload to the Apple portal to create a new production Push notification iOS .cer file.

Download the .cer file and import it into your Keychain Access. After importing, expand the imported cert and export the private key underneath it as a .p12 file with an empty password.

You might be able to skip the second portion (the .p12 encrypting) if you select the old key file underneath the old certificate (for the specific cert you are updating) in your Keychain Access when creating the new .certSigningRequest. If nothing is selected, a new key is created and it needs to be updated to the repo along with the cert.

Encrypt the new .cer file like this:

    $ bin/cryptoedit_osx edit autodeploy/files/live/ios_secrets/default/cert.pem.asc
    $ openssl x509 -in aps_production.cer -inform DER -outform PEM -out /Volumes/rdsecrets/file
    $ bin/cryptoedit_osx save autodeploy/files/live/ios_secrets/default/cert.pem.asc DCP

Encrypt the new .p12 file like this:

    $ bin/cryptoedit_osx edit autodeploy/files/live/ios_secrets/default/key.pem.asc
    $ openssl pkcs12 -in aps_production.p12 -out /Volumes/rdsecrets/file -nodes
    $ bin/cryptoedit_osx save autodeploy/files/live/ios_secrets/default/key.pem.asc DCP

# Preparing the fiddler account

The log-1 machine needs to have this in `/home/fiddler/.ssh/authorized_keys` (one line):
```
command="F=/var/log/worker.log; N=50000;G=sync_log; NFOUND=$(/usr/bin/tail -n $N $F |/usr/bin/wc -l); NLEFT=$(/usr/bin/expr $N - $NFOUND); /usr/bin/tail -n $NLEFT $F.1 |/bin/grep $G; /usr/bin/tail -n $N $F |/bin/grep $G",no-port-forwarding,no-x11-forwarding,no-agent-forwarding ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC9HxI5/4HqxVePywaTZCSBXM2s4mDJuUgxTGqXmIr14z4qa9zTiSC1JUQRgHlgr9atP79blynTk/UzkczCDU1yYgpDXkaCCcAF4YjzCov/N7iVIaD5mXT/oYE7f1m0t+yU33NL88MZkCmmIjBhSj4JYjXb6pvvHvDyKONcqMsA4f8NVC9Xt++PQawnl5Wbyri51TsQ9PcyATpzSm3TjbJebfhm9C09Di1rFVs+mpNxEGCQpVvR0EbtvmSJr8an4DlMCab5P+Ua+8fA932ujzA+TRMQrFzUqQBa+c8Sci8Nz77EqQvRY0Qm+BsyjGljCQeYZVtajMi/PRUZu+4evMSx fiddler_get_client_sync_log
```
