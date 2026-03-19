const User = require("../models/User");

exports.getUsers = async (req, res) => {
  const users = await User.find();
  res.json(users);
};

exports.createUser = async (req, res) => {
  const { name, email, password } = req.body;

  const user = new User({ name, email, password });

  await user.save();

  res.json(user);
};