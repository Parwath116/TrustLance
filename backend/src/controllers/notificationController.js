const Notification = require("../models/Notification");

async function listNotifications(req, res, next) {
  try {
    const userAddr = req.user.address.toLowerCase();
    const notifications = await Notification.find({ address: userAddr })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = await Notification.countDocuments({ address: userAddr, read: false });

    return res.json({
      notifications,
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
}

async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;
    const userAddr = req.user.address.toLowerCase();

    const notification = await Notification.findOneAndUpdate(
      { _id: id, address: userAddr },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found or unauthorized" });
    }

    return res.json({
      message: "Notification marked as read",
      notification,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listNotifications,
  markAsRead,
};
