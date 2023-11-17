const { Address } = require("../database/models");
const { BadRequestError, NotFoundError, ConflictError } = require("../errors");
const { StatusCodes } = require("http-status-codes");
const { createResponse } = require("../utils/createResponse");

const getAllAddressesMe = async (req, res) => {
  const {
    userInfo: { userId },
  } = req;
  const { count, rows } = await Address.findAndCountAll({
    where: { userId },
    order: [["using", "desc"]],
  });
  const response = createResponse({
    message: "get addresses success",
    status: StatusCodes.CREATED,
    data: rows,
    total: count,
  });
  res.status(response.status).json(response);
};
const addAddressMe = async (req, res) => {
  const {
    userInfo: { userId },
    body: { phoneNumber, province, district, ward, fullName },
  } = req;

  if (!phoneNumber || !province || !district || !ward || !fullName)
    throw new BadRequestError("info is required");

  req.body.userId = userId;
  await Address.update({ using: false }, { where: { userId } });
  req.body.using = true;
  await Address.create(req.body);
  const response = createResponse({
    message: "add new address success",
    status: StatusCodes.CREATED,
  });
  res.status(response.status).json(response);
};

const getAddressMe = async (req, res) => {
  const {
    params: { id },
    userInfo: { userId },
  } = req;
  const address = await Address.findOne({ where: { id, userId } });
  if (!address) throw new NotFoundError(`Khong tim thay dia chi`);
  const response = createResponse({
    message: "success",
    status: StatusCodes.OK,
    data: address,
  });
  res.status(response.status).json(response);
};

const updateAddressMe = async (req, res) => {
  const {
    params: { id },
    userInfo: { userId },
    body: {
      phoneNumber,
      province,
      district,
      ward,
      country,
      residence,
      fullName,
      note,
      using,
    },
  } = req;
  const address = await Address.findOne({ where: { id, userId } });
  if (!address) throw new NotFoundError(`Email/password is not correct!`);
  if (phoneNumber) address.phoneNumber = phoneNumber;
  if (province) address.province = province;
  if (district) address.district = district;
  if (ward) address.ward = ward;
  if (country) address.country = country;
  if (fullName) address.fullName = fullName;
  if (note) address.note = note;
  if (using) address.using = using;
  if (residence) address.residence = residence;
  await address.save();
  const response = createResponse({
    message: "updated successfully",
    status: StatusCodes.OK,
  });
  res.status(response.status).json(response);
};

const deleteAddressMe = async (req, res) => {
  const {
    params: { id },
    userInfo: { userId },
  } = req;
  const address = await Address.findOne({ where: { id, userId } });
  if (!address) throw new NotFoundError(`Khong tim thay dia chi`);
  await address.destroy();
  const response = createResponse({
    message: "deleted successfully",
    status: StatusCodes.OK,
  });
  res.status(response.status).json(response);
};
module.exports = {
  addAddressMe,
  getAddressMe,
  updateAddressMe,
  deleteAddressMe,
  getAllAddressesMe,
};
