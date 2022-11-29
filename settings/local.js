exports.get = function(setting) {
  return {
    install_dir : '.',
    stage_dir : 'dev',
    development_logging : 1,
    development_push_notifications : 1,
    development_check_client_sync_log_command : [ 'ssh', 'log-1', 'bash -c \'F=/var/log/worker.log; N=50000;G=sync_log; NFOUND=$(/usr/bin/tail -n $N $F |/usr/bin/wc -l); NLEFT=$(/usr/bin/expr $N - $NFOUND); /usr/bin/tail -n $NLEFT $F.1 |/bin/grep $G; /usr/bin/tail -n $N $F |/bin/grep $G\''],
    concurrent_jobs : 1,
    memcached_servers : [
      { host : '127.0.0.1', port : 11211 },
    ],
    gearman_servers : [
      { host : '127.0.0.1', port : 4730 },
    ],
    write_mysql : { host : '127.0.0.1', port : 3306 },
    read_mysqls : [
      { host : '127.0.0.1', port : 3306 },
    ]
  }[setting];
}
