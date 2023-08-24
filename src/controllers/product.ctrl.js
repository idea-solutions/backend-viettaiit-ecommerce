const { StatusCodes } = require("http-status-codes");
const { BadRequestError, NotFoundError, ConflictError } = require("../errors");
const { Category, Product, ProductItem, sequelize } = require("../models");
const { Op } = require("sequelize");
const { createResponse } = require("../utils/createResponse");
const { createSlug } = require("../utils/slug");
var format = /[`!@#$%^&*\=\[\]{};':"\\|,.<>\?~`]/;
const getProductsStatic = async (req, res) => {
  const { count, rows } = await Product.findAndCountAll({});
  const response = createResponse({
    message: "Tạo mới sản phẩm thành công",
    status: StatusCodes.OK,
    total: count,
    data: rows,
  });
  res.status(response.status).json(response);
};
const getProducts = async (req, res) => {
  const { name, categoryName, discount, providerName, numericFilters, sort } =
    req.query;
  const queryObjectProduct = {};
  const queryObjectCategory = {};
  const queryObjectProvider = {};
  if (name)
    queryObjectProduct.name = {
      [Op.like]: `%${name}%`,
    };
  if (discount === "true") {
    queryObjectProduct.discount = {
      [Op.eq]: 0,
    };
  }
  if (numericFilters) {
    const regex = /\b(>|>=|=|<|<=)\b/g;
    const listFilters = numericFilters.replace(regex, (match) => `-${match}-`);
    listFilters.split(",").forEach((item) => {
      const [field, operation, value] = item.split("-");
      switch (operation) {
        case ">":
          queryObjectProduct[field] = { [Op.gt]: value };
          break;
        case ">=":
          queryObjectProduct[field] = { [Op.gte]: value };
          break;
        case "<":
          queryObjectProduct[field] = { [Op.lt]: value };
          break;
        case "<=":
          queryObjectProduct[field] = { [Op.lte]: value };
          break;
        case "=":
          queryObjectProduct[field] = { [Op.eq]: value };
          break;
        default:
          break;
      }
    });
  }
  if (categoryName && categoryName != "all")
    queryObjectCategory.categoryName = {
      [Op.like]: `${categoryName}`,
    };
  if (providerName) {
    queryObjectProvider.providerName = {
      [Op.like]: `${providerName}`,
    };
  }
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 6;
  const offset = (page - 1) * limit;
  let order = [["createdAt", "desc"]];
  if (sort) {
    order = [];
    if (sort.startsWith("-")) order.push([sort.slice(1), "desc"]);
    else order.push([sort, "asc"]);
  }
  const products = Product.findAll({
    attributes: {
      include: [
        [
          sequelize.literal(`(
            SELECT SUM(qtyInStock) FROM ProductItems WHERE ProductItems.productId = Product.id
          )`),
          "inventoryCount",
        ],
      ],
    },
    where: queryObjectProduct,
    include: [
      {
        association: "provider",
        attributes: { exclude: ["createdAt", "updatedAt"] },
        where: queryObjectProvider,
      },
      {
        association: "category",
        attributes: { exclude: ["createdAt", "updatedAt"] },

        where: queryObjectCategory,
      },
    ],
    order,
    limit,
    offset,
  });
  const count = await Product.count();

  const result = await products;

  const response = createResponse({
    message: "Lấy sản phẩm thành công",
    status: StatusCodes.OK,
    page,
    perPage: limit,
    total: count,
    totalPages: Math.ceil(count / limit),
    data: result,
  });
  res.status(response.status).json(response);
};
const createProduct = async (req, res) => {
  const { name, image, categoryId, description, price, productItems } =
    req.body;
  if (name.match(format)) {
    throw new BadRequestError("Tên sản phẩm không thể chứa kí tự đặc biệt!");
  }
  if (!name || !image || !categoryId || !description || !price)
    throw new BadRequestError("Vui lòng cung cấp dầy đủ thông tin!");
  const isSlugHave = await Product.findOne({
    where: { slug: createSlug(name) },
  });
  console.log("erro : dsa");
  if (!productItems) {
    throw new BadRequestError("Vui lòng cung cấp các sản phẩm con!");
  }
  if (isSlugHave)
    throw new BadRequestError(`Sản phẩm có tên ${name} đã tồn tại`);
  const isCategoryHave = await Category.findByPk(categoryId);
  if (!isCategoryHave) {
    throw new NotFoundError(`Category với id ${categoryId} không tìm thấy!`);
  }
  req.body.image = process.env.BACKEND_URL + "/static/uploads/" + image;
  req.body.slug = createSlug(name);
  await sequelize.transaction(async (t) => {
    const product = await Product.create(
      { ...req.body },
      {
        include: ["productItems"],
        transaction: t,
      },
      { transaction: t }
    );

    const response = createResponse({
      message: "Tạo mới sản phẩm thành công",
      status: StatusCodes.CREATED,
      data: product,
    });
    res.status(response.status).json(response);
  });
};

const getProduct = async (req, res) => {
  const {
    params: { slug },
  } = req;
  const product = await Product.findOne({
    where: { slug },
    attributes: { exclude: ["createdAt", "updatedAt"] },
    include: {
      association: "productItems",
      attributes: { exclude: ["createdAt", "updatedAt"] },
    },
  });
  if (!product) throw new NotFoundError("Sản phẩm không được tìm thấy!");

  const response = createResponse({
    message: "Tạo mới sản phẩm thành công",
    status: StatusCodes.CREATED,
    data: product,
  });
  res.status(StatusCodes.OK).json(response);
};

const updateProduct = async (req, res) => {
  const {
    params: { slug },
    body: { price, discount, description },
  } = req;
  if (!price && !discount && !(discount === 0) && !description) {
    throw new BadRequestError(
      "Vui lòng cung cấp ít nhất 1 giá trị cần cập nhật(price, discount, description)"
    );
  }
  const product = await Product.findOne({ where: { slug } });
  if (!product) {
    throw new NotFoundError("Không tìm thấy sản phẩm!");
  }
  if (price) product.price = price;

  if (discount === 0 || discount) product.discount = discount;
  if (description) product.description = description;
  await product.save();
  const response = createResponse({
    message: "Cập nhật sản phẩm thành công",
    status: StatusCodes.OK,
    data: product,
  });
  res.status(response.status).json(response);
};

// delete one product
const deleteProduct = async (req, res) => {
  const {
    params: { slug },
  } = req;
  const product = await Product.findOne({ where: { slug } });
  if (!product) {
    throw new NotFoundError("Không tìm thấy sản phẩm!");
  }
  await product.destroy();
  const response = createResponse({
    message: "Xóa sản phẩm thành công",
    status: StatusCodes.OK,
  });
  res.status(response.status).json(response);
};

// add productItem to one product
const addProductItem = async (req, res) => {
  const {
    params: { slug },
    body: { colorId, image, qtyInStock },
  } = req;
  if (!colorId) throw new BadRequestError("Vui lòng cung cấp mã màu sản phẩm");
  if (!image) throw new BadRequestError("Vui lòng cung cấp ảnh của sản phẩm");
  req.body.image = process.env.BACKEND_URL + "/static/uploads/" + image;
  if (!qtyInStock)
    throw new BadRequestError("Vui lòng cung cấp số lượng của sản phẩm!");
  const product = await Product.findOne({ where: { slug } });
  if (!product) {
    throw new NotFoundError("Sản phẩm không tìm thấy!");
  }
  const isExistItem = await ProductItem.findOne({
    where: { colorId, productId: product.id },
  });
  if (isExistItem) throw new ConflictError("Sản phẩm đã tồn tại");
  req.body.productId = product.id;
  await ProductItem.create({ ...req.body });
  const response = createResponse({
    message: "Thêm sản phẩm thành công",
    status: StatusCodes.OK,
  });
  res.status(response.status).json(response);
};

const deleteManyProduct = async (req, res) => {
  const { slugs } = req.body;
  await Product.destroy({ where: { slug: slugs } });
  const response = createResponse({
    message: "Xóa nhiều SP thành công!",
    status: StatusCodes.OK,
  });
  res.status(response.status).json(response);
};
module.exports = {
  getProducts,
  createProduct,
  getProductsStatic,
  updateProduct,
  deleteProduct,
  getProduct,
  addProductItem,
  deleteManyProduct,
};
