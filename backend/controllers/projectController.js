import Project from "../models/Project.js";
import Message from "../models/Message.js";
import mongoose from "mongoose";

// @desc    Get all projects for logged-in user
export const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ user_id: req.user.id }).sort({
      updatedAt: -1,
    });
    res.json(projects);
  } catch (error) {
    console.error("getProjects error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single project by ID
export const getProjectById = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      user_id: req.user.id,
    });
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  } catch (error) {
    console.error("getProjectById error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new project
export const createProject = async (req, res) => {
  try {
    const { title, description } = req.body;
    const project = await Project.create({
      user_id: req.user.id,
      title: title || "Untitled Project",
      description: description || "",
    });
    res.status(201).json(project);
  } catch (error) {
    console.error("createProject error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a project
export const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }
    const {
      title,
      description,
      language,
      status,
      plan,
      generated_code,
      console_output,
    } = req.body;
    const project = await Project.findOneAndUpdate(
      { _id: id, user_id: req.user.id },
      {
        title,
        description,
        language,
        status,
        plan,
        generated_code,
        console_output,
      },
      { new: true, runValidators: true },
    );
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  } catch (error) {
    console.error("updateProject error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a project
export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findOneAndDelete({
      _id: id,
      user_id: req.user.id,
    });
    if (!project) return res.status(404).json({ message: "Project not found" });
    await Message.deleteMany({ project_id: id });
    res.json({ message: "Project deleted" });
  } catch (error) {
    console.error("deleteProject error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all messages for a project
export const getProjectMessages = async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }
    const messages = await Message.find({ project_id: projectId }).sort({
      createdAt: 1,
    });
    res.json(messages);
  } catch (error) {
    console.error("getProjectMessages error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Save a new message
export const saveMessage = async (req, res) => {
  try {
    const { project_id, role, agent, content } = req.body;
    if (!mongoose.Types.ObjectId.isValid(project_id)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }
    const message = await Message.create({
      project_id,
      user_id: req.user.id,
      role,
      agent,
      content,
    });
    res.status(201).json(message);
  } catch (error) {
    console.error("saveMessage error:", error);
    res.status(500).json({ message: error.message });
  }
};
