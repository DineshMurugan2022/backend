module.exports = {
    apps: [{
        name: 'crm-backend',
        script: 'server.js',
        instances: 1, // Start with 1 on Render Free tier to avoid memory issues
        exec_mode: 'cluster',
        autorestart: true,
        watch: false,
        max_memory_restart: '512M',
        env: {
            NODE_ENV: 'production'
        },
        error_file: 'logs/pm2-error.log',
        out_file: 'logs/pm2-out.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }]
};
