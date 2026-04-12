// backend/controllers/projectController.js
import Project from "../models/Project.js";
import Message from "../models/Message.js";

// ── GET /api/projects ─────────────────────────────────────────────────────────
export const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ user_id: req.user.id }).sort({
      updatedAt: -1,
    });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/projects/:id ─────────────────────────────────────────────────────
export const getProjectById = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      user_id: req.user.id,
    });
    if (!project) return res.status(404).json({ error: "Not found" });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/projects ────────────────────────────────────────────────────────
export const createProject = async (req, res) => {
  try {
    const project = await Project.create({
      user_id: req.user.id,
      title: req.body.title || "Untitled",
      description: req.body.description || "",
    });
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── PUT /api/projects/:id ─────────────────────────────────────────────────────
export const updateProject = async (req, res) => {
  try {
    // Strip fields the client should never overwrite directly
    const { user_id, _id, ...updates } = req.body;

    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.id },
      updates,
      { new: true },
    );
    if (!project) return res.status(404).json({ error: "Not found" });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── DELETE /api/projects/:id ──────────────────────────────────────────────────
export const deleteProject = async (req, res) => {
  try {
    const project = await Project.findOneAndDelete({
      _id: req.params.id,
      user_id: req.user.id,
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    // Cascade-delete all messages belonging to this project
    await Message.deleteMany({ project_id: req.params.id });

    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/projects/:projectId/messages ─────────────────────────────────────
export const getProjectMessages = async (req, res) => {
  try {
    const messages = await Message.find({
      project_id: req.params.projectId,
    }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/projects/messages ───────────────────────────────────────────────
// project_id comes from req.body (set by the frontend hook)
export const saveMessage = async (req, res) => {
  try {
    const { project_id, role, agent, content } = req.body;

    if (!project_id || !role || !content) {
      return res
        .status(400)
        .json({ error: "project_id, role, and content are required" });
    }

    const message = await Message.create({
      project_id,
      user_id: req.user.id,
      role,
      agent,
      content,
    });
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
