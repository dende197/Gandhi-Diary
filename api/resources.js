module.exports = async function handler(req, res) {
    // Gateway for user-specific resources based on URL path or query
    const url = req.url.split('?')[0];
    
    if (url.includes('/planner')) {
        return require('../api_internal/planner/[user_id]')(req, res);
    }
    if (url.includes('/profile')) {
        return require('../api_internal/profile/[user_id]')(req, res);
    }
    if (url.includes('/conversations')) {
        return require('../api_internal/conversations/user/[user_id]')(req, res);
    }

    res.status(404).json({ success: false, error: 'Resource not found' });
};
