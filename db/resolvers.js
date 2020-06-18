const Usuario = require("../models/Usuario");
const Producto = require("../models/Producto");
const Cliente = require("../models/Cliente");
const Pedido = require("../models/Pedido");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "variables.env" });

const crearToken = (usuario, secreta, expiresIn) => {
  const { id, email, nombre, apellido } = usuario;
  return jwt.sign({ id, email, nombre, apellido }, secreta, { expiresIn });
};

const resolvers = {
  Query: {
    obtenerUsuario: async (_, {}, ctx) => {
      return ctx.usuario;
    },
    obtenerProductos: async () => {
      try {
        const productos = await Producto.find({});
        return productos;
      } catch (error) {
        console.log("Hubo un error");
        console.log(error);
      }
    },
    obtenerProducto: async (_, { id }) => {
      /* revisar si existe  el producto */
      const producto = await Producto.findById(id);
      if (!producto) {
        throw new Error("Producto No encontrado");
      }
      return producto;
    },
    obtenerClientes: async () => {
      try {
        const clientes = Cliente.find({});
        return clientes;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerClientesVendedor: async (_, {}, ctx) => {
      try {
        const clientes = Cliente.find({ vendedor: ctx.usuario.id.toString() });
        return clientes;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerCliente: async (_, { id }, ctx) => {
      const cliente = await Cliente.findById(id);
      if (!cliente) {
        throw new Error("No se encuentra este cliente");
      }
      if (cliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No estas autorizado");
      }
      return cliente;
    },
    obtenerPedidos: async () => {
      try {
        const pedidos = await Pedido.find({});
        return pedidos;
      } catch (error) {
        console.log("Error");
        console.log(error);
      }
    },
    obtenerPedidosVendedor: async (_, {}, ctx) => {
      try {
        const pedidos = await Pedido.find({
          vendedor: ctx.usuario.id,
        }).populate("cliente");
        return pedidos;
      } catch (error) {
        console.log("Error");
        console.log(error);
      }
    },
    obtenerPedido: async (_, { id }, ctx) => {
      /* Si existe o no */
      const pedido = await Pedido.findById(id);
      if (!pedido) {
        throw new Error("Pedido No encontrado");
      }
      /* Solo quien lo creo pueda verlo */
      if (pedido.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("Accion no permitida");
      }
      /* retornar el resultado */
      return pedido;
    },
    obtenerPedidosEstado: async (_, { estado }, ctx) => {
      const pedidos = await Pedido.find({ vendedor: ctx.usuario.id, estado });
      return pedidos;
    },
    mejoresClientes: async () => {
      const clientes = await Pedido.aggregate([
        { $match: { estado: "Completado" } },
        { $group: { _id: "$cliente", total: { $sum: "$total" } } },
        {
          $lookup: {
            from: "clientes",
            localField: "_id",
            foreignField: "_id",
            as: "cliente",
          },
        },
        { $limit: 10 },
        { $sort: { total: -1 } },
      ]);
      return clientes;
    },
    mejoresVendedores: async () => {
      const vendedores = await Pedido.aggregate([
        { $match: { estado: "Completado" } },
        { $group: { _id: "$vendedor", total: { $sum: "$total" } } },
        {
          $lookup: {
            from: "usuarios",
            localField: "_id",
            foreignField: "_id",
            as: "vendedor",
          },
        },
        {
          $limit: 3,
        },
        {
          $sort: { total: -1 },
        },
      ]);
      return vendedores;
    },
    buscarProducto: async (_, { texto }) => {
      const productos = await Producto.find({
        $text: { $search: texto },
      }).limit(10);
      return productos;
    },
  },
  Mutation: {
    nuevoUsuario: async (_, { input }) => {
      const { email, password } = input;
      /* Revisar si el usuario esta registrado */
      const existeUsuario = await Usuario.findOne({ email });
      if (existeUsuario) {
        throw new Error("El usuario ya esta registrado");
      }

      /* Hashear password */
      const salt = await bcryptjs.genSalt(10);
      input.password = await bcryptjs.hash(password, salt);

      try {
        /* Guardar en base de datos */
        const usuario = new Usuario(input);
        usuario.save();
        return usuario;
      } catch (error) {
        console.log("Hubo un error");
        console.log(error);
      }
    },
    autenticarUsuario: async (_, { input }) => {
      const { email, password } = input;
      /* Si el usuario existe */
      const existeUsuario = await Usuario.findOne({ email });
      if (!existeUsuario) {
        throw new Error("El usuario no existe");
      }
      /* Revisar si el password es correcto */
      const passwordCorrecto = await bcryptjs.compare(
        password,
        existeUsuario.password
      );
      if (!passwordCorrecto) {
        throw new Error("Password Incorrecto");
      }

      /* Crear token */
      return {
        token: crearToken(existeUsuario, process.env.SECRETA, "24h"),
      };
    },
    nuevoProducto: async (_, { input }) => {
      try {
        const producto = new Producto(input);
        const resultado = await producto.save();
        return resultado;
      } catch (error) {
        console.log("Hubo un error");
        console.log(error);
      }
    },
    actualizarProducto: async (_, { id, input }) => {
      let producto = await Producto.findById(id);
      if (!producto) {
        throw new Error("Producto No encontrado");
      }

      producto = await Producto.findOneAndUpdate({ _id: id }, input, {
        new: true,
      });
      return producto;
    },
    eliminarProducto: async (_, { id }) => {
      let producto = await Producto.findById(id);
      if (!producto) {
        throw new Error("Producto No encontrado");
      }
      await Producto.findOneAndDelete({ _id: id });
      return "Producto Eliminado";
    },
    nuevoCliente: async (_, { input }, ctx) => {
      const { email } = input;
      /* console.log(ctx); */

      /* Verificar si el cliente esta registrado */
      const cliente = await Cliente.findOne({ email });
      if (cliente) {
        throw new Error("Cliente ya registrado");
      }
      const nuevoCliente = new Cliente(input);
      /* Asignar el vendedor */
      nuevoCliente.vendedor = ctx.usuario.id;

      /* Guardar en la DB */
      try {
        const resultado = await nuevoCliente.save();
        return resultado;
      } catch (error) {
        console.log("Hubo un error");
        console.log(error);
      }
    },
    actualizarCliente: async (_, { id, input }, ctx) => {
      let cliente = await Cliente.findById(id);
      if (!cliente) {
        throw new Error("No se encuentra este cliente");
      }
      if (cliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No estas autorizado");
      }
      cliente = await Cliente.findOneAndUpdate({ _id: id }, input, {
        new: true,
      });
      return cliente;
    },
    eliminarCliente: async (_, { id }, ctx) => {
      let cliente = await Cliente.findById(id);
      if (!cliente) {
        throw new Error("No se encuentra este cliente");
      }
      if (cliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No estas autorizado");
      }
      await Cliente.findOneAndDelete({ _id: id });
      return "Cliente Eliminado";
    },
    nuevoPedido: async (_, { input }, ctx) => {
      const { cliente } = input;
      /* Verificar si el cliente existe */
      let clienteExiste = await Cliente.findById(cliente);
      if (!clienteExiste) {
        throw new Error("No se encuentra este cliente");
      }
      /* Verificar si el cliente es del vendedor */
      if (clienteExiste.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No estas autorizado");
      }
      /* Revisar que el stock este disponible */
      for await (const articulo of input.pedido) {
        const { id } = articulo;
        const producto = await Producto.findById(id);
        if (articulo.cantidad > producto.existencia) {
          throw new Error(
            `El articulo ${producto.nombre} excede la cantidad disponible`
          );
        } else {
          producto.existencia = producto.existencia - articulo.cantidad;
          await producto.save();
        }
      }
      /* Crear un Nuevo pedido */
      const nuevoPedido = new Pedido(input);

      /* Asignarle un vendedor */
      nuevoPedido.vendedor = ctx.usuario.id;

      /* Guardar en la db */
      const resultado = await nuevoPedido.save();
      return resultado;
    },
    actualizarPedido: async (_, { id, input }, ctx) => {
      const { cliente } = input;

      // Si el pedido existe
      const existePedido = await Pedido.findById(id);
      if (!existePedido) {
        throw new Error("El pedido no existe");
      }

      // Si el cliente existe
      const existeCliente = await Cliente.findById(cliente);
      if (!existeCliente) {
        throw new Error("El Cliente no existe");
      }

      // Si el cliente y pedido pertenece al vendedor
      if (existeCliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No tienes las credenciales");
      }

      // Revisar el stock
      if (input.pedido) {
        for await (const articulo of input.pedido) {
          const { id } = articulo;

          const producto = await Producto.findById(id);

          if (articulo.cantidad > producto.existencia) {
            throw new Error(
              `El articulo: ${producto.nombre} excede la cantidad disponible`
            );
          } else {
            // Restar la cantidad a lo disponible
            producto.existencia = producto.existencia - articulo.cantidad;

            await producto.save();
          }
        }
      }

      // Guardar el pedido
      const resultado = await Pedido.findOneAndUpdate({ _id: id }, input, {
        new: true,
      });
      return resultado;
    },
    eliminarPedido: async (_, { id }, ctx) => {
      const pedido = await Pedido.findById(id);
      if (!pedido) {
        throw new error("El pedido No existe");
      }
      if (pedido.vendedor.toString() !== ctx.usuario.id) {
        throw new error("No tienes las credenciales");
      }
      await Pedido.findByIdAndDelete({ _id: id });
      return "Pedido ELiminado";
    },
  },
};
module.exports = resolvers;
