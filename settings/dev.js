exports.get = function(setting) {
  return {
    install_dir : '/opt/meetings/worker-js',
    stage_dir : 'dev',
    development_logging : 1,
    development_push_notifications : 1,
    concurrent_jobs : 10,
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
