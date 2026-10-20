const { AppError } = require('../../utils/errors');
const { sendSuccess } = require('../../utils/response');
const { removeUploadPaths } = require('../../utils/uploads');
const chatService = require('./chat.service');

const TEXT_MAX = 1000;
const CLIENT_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

const validateSend = (body, file) => {
  const text = typeof body?.text === 'string' ? body.text.trim() : '';

  if (body?.text !== undefined && typeof body.text !== 'string') return { error: 'text must be a string' };
  if (!text && !file) return { error: 'Write a message or attach a photo' };
  if (text.length > TEXT_MAX) return { error: `Messages can be at most ${TEXT_MAX} characters` };

  const clientId = body?.clientId === undefined || body.clientId === '' ? null : String(body.clientId);
  if (clientId !== null && !CLIENT_ID_REGEX.test(clientId)) {
    return { error: 'clientId must be 1–64 letters, digits, - or _' };
  }

  return { data: { text, clientId } };
};

const listMessages = async (req, res, next) => {
  try {
    const result = await chatService.listMessages(req.userId, req.params.id, req.query);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const validation = validateSend(req.body, req.file);
    if (validation.error) {
      if (req.file) removeUploadPaths([`/uploads/chat-images/${req.file.filename}`]);
      throw new AppError(validation.error, 400);
    }

    const { message, duplicate } = await chatService.sendMessage(req.user, req.params.id, validation.data, req.file);
    return sendSuccess(res, { message, duplicate }, duplicate ? 200 : 201);
  } catch (err) {
    next(err);
  }
};

const deleteMessage = async (req, res, next) => {
  try {
    const { message } = await chatService.deleteMessage(req.userId, req.params.id, req.params.messageId);
    return sendSuccess(res, { message, deleted: true });
  } catch (err) {
    next(err);
  }
};

const markRead = async (req, res, next) => {
  try {
    await chatService.assertChatAccess(req.userId, req.params.id);
    await chatService.markRead(req.userId, req.params.id);
    return sendSuccess(res, { read: true });
  } catch (err) {
    next(err);
  }
};

const listThreads = async (req, res, next) => {
  try {
    const result = await chatService.listThreads(req.userId);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listMessages,
  sendMessage,
  deleteMessage,
  markRead,
  listThreads,
};
