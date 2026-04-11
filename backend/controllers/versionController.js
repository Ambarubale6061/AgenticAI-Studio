import Version from "../models/Version.js";

export const getVersions = async (req, res) => {
  try {
    const versions = await Version.find({
      project_id: req.params.projectId,
    }).sort({ createdAt: -1 });
    res.json(versions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createVersion = async (req, res) => {
  try {
    const { label, files } = req.body;
    const version = await Version.create({
      project_id: req.params.projectId,
      label,
      files,
    });
    res.status(201).json(version);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteVersion = async (req, res) => {
  try {
    await Version.findByIdAndDelete(req.params.versionId);
    res.json({ message: "Version deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
