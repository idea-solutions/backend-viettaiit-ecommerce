const { StatusCodes } = require("http-status-codes");
const { BadRequestError, NotFoundError, ConflictError } = require("../errors");
const {
  Category,
  Product,
  ProductItem,
  Cache,
  sequelize,
} = require("../database/models");
const { Op } = require("sequelize");
const { createResponse } = require("../utils/createResponse");
const { createSlug } = require("../utils/slug");
var format = /[`!@#$%^&*\=\[\]{};':"\\|,<>\?~`]/;

const getProductsStatic = async (req, res) => {
  const { count, rows } = await Product.findAndCountAll({});
  const response = createResponse({
    message: "Thêm sản phẩm mới thành công",
    status: StatusCodes.OK,
    total: count,
    data: rows,
  });
  res.status(response.status).json(response);
};

const getProducts = async (req, res) => {
  const {
    name,
    categoryId,
    discount = "false",
    providerId,
    numericFilters,
    sort,
  } = req.query;
  const queryObjectProduct = {};
  const queryObjectCategory = {};
  const queryObjectProvider = {};
  let arrCache = [];
  if (name) {
    queryObjectProduct.name = {
      [Op.like]: `%${name}%`,
    };
    arrCache.push({ key: "name", value: name });
  }

  if (discount === "true") {
    queryObjectProduct.discount = {
      [Op.ne]: 0,
    };
    arrCache.push({ key: "discount", value: discount });
  }

  if (numericFilters) {
    const regex = /\b(>|>=|=|<|<=)\b/g;
    const listFilters = numericFilters.replace(regex, (match) => `-${match}-`);
    arrCache.push({ key: "listFilters", value: listFilters });
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
  if (categoryId) {
    queryObjectCategory.id = {
      [Op.like]: `${categoryId}`,
    };
    arrCache.push({ key: "categoryId", value: categoryId });
  }
  if (providerId) {
    queryObjectProvider.id = {
      [Op.like]: `${providerId}`,
    };
    arrCache.push({ key: "providerId", value: providerId });
  }

  const page = parseInt(req.query.page) || 1;
  arrCache.push({ key: "page", value: page });
  const limit = parseInt(req.query.limit) || 8;
  arrCache.push({ key: "limit", value: limit });
  const offset = (page - 1) * limit;
  arrCache.push({ key: "offset", value: offset });
  let order = [["createdAt", "desc"]];
  if (sort) {
    order = [];
    if (sort.startsWith("-")) order.push([sort.slice(1), "desc"]);
    else order.push([sort, "asc"]);
    arrCache.push({ key: "sort", value: sort + "" });
  }

  let keyCache = "";
  let len = arrCache.length;
  if (len > 0) {
    keyCache = arrCache
      .map((item, i) => {
        let val = item.key + ":" + item.value;
        if (i !== len - 1) val += ",";
        return val;
      })
      .join("");
  }
  const existingKeyCache = await Cache.findOne({ where: { key: keyCache } });
  let totalPages;
  let perPage;
  let total;
  let data;
  const response = createResponse({
    message: "Thành công",
    status: StatusCodes.OK,
  });
  if (existingKeyCache) {
    let dataCacheExist = JSON.parse(existingKeyCache.data);
    response.totalPages = dataCacheExist.totalPages;
    response.perPage = dataCacheExist.perPage;
    response.page = dataCacheExist.page;
    response.total = dataCacheExist.total;
    response.data = dataCacheExist.data;
  } else {
    const { count, rows } = await Product.findAndCountAll({
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
    totalPages = Math.ceil(count / limit);
    data = rows;
    total = count;
    let dataCache = JSON.stringify({
      page,
      perPage,
      total,
      totalPages,
      data,
    });
    await Cache.create({ key: keyCache, data: dataCache });
    response.totalPages = totalPages;
    response.perPage = perPage;
    response.page = page;
    response.total = total;
    response.data = data;
  }
  res.status(response.status).json(response);
};

const createProduct = async (req, res) => {
  const { name, image, categoryId, description, price, productItems } =
    req.body;
  if (name.match(format)) {
    throw new BadRequestError("Tên SP không được chứa ký tự đặc biệt");
  }
  if (!name || !image || !categoryId || !description || !price)
    throw new BadRequestError("Vui lòng cung cấp thông tin!");
  const isSlugHave = await Product.findOne({
    where: { slug: createSlug(name) },
  });
  if (!productItems) {
    throw new BadRequestError("Vui lòng cung cấp sản phẩm phụ");
  }
  if (isSlugHave) throw new BadRequestError(`Tên ${name} đã được sử dụng`);
  const isCategoryHave = await Category.findByPk(categoryId);
  if (!isCategoryHave) {
    throw new NotFoundError(`Không tìm thấy danh mục có id ${categoryId}!`);
  }

  req.body.image = image;
  req.body.slug = createSlug(name);
  await sequelize.transaction(async (t) => {
    const product = await Product.create(
      { ...req.body, productItems },
      {
        include: ["productItems"],
        transaction: t,
      },
      { transaction: t }
    );

    const response = createResponse({
      message: "Thêm sản phẩm mới thành công",
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
  let keyCache = `product-detail-name:${slug}`;
  const existKey = await Cache.findOne({ where: { key: keyCache } });
  const response = createResponse({
    message: "Nhận thông tin chi tiết sản phẩm thành công",
    status: StatusCodes.OK,
  });
  if (existKey) {
    response.data = JSON.parse(existKey.data);
  } else {
    const product = await Product.findOne({
      where: { slug },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      include: [
        {
          association: "productItems",
          attributes: { exclude: ["createdAt", "updatedAt"] },
          include: {
            association: "color",
            attributes: { exclude: ["createdAt", "updatedAt"] },
          },
        },
        {
          association: "category",
          attributes: { exclude: ["createdAt", "updatedAt"] },
        },
        {
          association: "provider",
          attributes: { exclude: ["createdAt", "updatedAt"] },
        },
      ],
    });
    if (!product) throw new NotFoundError("Sản phẩm không có!");
    let dataCache = JSON.stringify(product);
    response.data = product;
    await Cache.create({ key: keyCache, data: dataCache });
  }
  res.status(response.status).json(response);
};

const updateProduct = async (req, res) => {
  const {
    params: { slug },
    body: { image, categoryId, description, price, productItems },
  } = req;

  const product = await Product.findOne({ where: { slug } });
  if (!product) {
    throw new NotFoundError("Sản phẩm không tìm thấy");
  }
  // product.name = name;
  product.image = image;
  product.categoryId = categoryId;
  product.description = description;
  product.price = price;

  for (const productItem of productItems) {
    const productItemExist = await ProductItem.findOne({
      where: {
        productId: product.id,
        id: productItem.id ? productItem.id : null,
      },
    });
    if (productItemExist) {
      productItemExist.qtyInStock = productItem.qtyInStock;
      productItemExist.image = productItem.image;
      productItemExist.isSpecial = productItem.isSpecial;
      productItemExist.colorId = productItem.colorId;
      await productItemExist.save();
    } else {
      await ProductItem.create({
        image: productItem.image,
        qtyInStock: productItem.qtyInStock,
        colorId: productItem.colorId,
        isSpecial: productItem.isSpecial,
        productId: product.id,
      });
    }
  }
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
    throw new NotFoundError("Sản phẩm không tìm thấy");
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
  if (!colorId) throw new BadRequestError("Vui lòng cung cấp một màu sắc");
  if (!image) throw new BadRequestError("Vui lòng cung cấp một hình ảnh");
  req.body.image = process.env.BACKEND_URL + "/static/uploads/" + image;
  if (!qtyInStock)
    throw new BadRequestError("Vui lòng cung cấp số lượng trong kho");
  const product = await Product.findOne({ where: { slug } });
  if (!product) {
    throw new NotFoundError("Sản phẩm không tìm thấy");
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
    message: "Xóa nhiều sản phẩm thành công",
    status: StatusCodes.OK,
  });
  res.status(response.status).json(response);
};

// get product hot sales
const getProductHotSales = async (req, res) => {
  const products = await Product.findAll({
    where: { discount: { [Op.ne]: 0 } },
    offset: 0,
    limit: 10,
  });

  const response = createResponse({
    message: "Nhận sản phẩm giảm giá",
    status: StatusCodes.OK,
    data: products,
  });
  res.status(response.status).json(response);
};

const getProductsPhuKien = async (req, res) => {
  const products = await Product.findAll({
    include: [
      {
        association: "category",
        attributes: { exclude: ["createdAt", "updatedAt"] },
        where: { categoryName: "Phụ kiện" },
      },
    ],
    offset: 0,
    limit: 10,
  });

  const response = createResponse({
    message: "Nhận sản phẩm giảm giá",
    status: StatusCodes.OK,
    data: products,
  });
  res.status(response.status).json(response);
};

// get product hot sales
const getProductsCategory = async (req, res) => {
  const { categoryName } = req.params;

  const products = await Product.findAll({
    where: { name: { [Op.substring]: `${categoryName}` } },
    offset: 0,
    limit: 8,
  });

  const response = createResponse({
    message: `Lấy danh mục sản phẩm ${categoryName}`,
    status: StatusCodes.OK,
    data: products,
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
  getProductHotSales,
  getProductsCategory,
  getProductsPhuKien,
};
