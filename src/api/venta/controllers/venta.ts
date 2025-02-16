"use strict";

import { Session } from "inspector/promises";

//@ts-ignore
const stripe =require("stripe")(process.env.SECRET_STRIPE_KEY)


/**
 * venta controller
 */

const { createCoreController }=require("@strapi/strapi").factories;

module.exports=createCoreController("api::venta.venta",({strapi})=>({
    async create(ctx) {
        //@ts-ignore
        const { products } = ctx.request.body;
        
        // Validar que products es un array
        if (!products || !Array.isArray(products) || products.length === 0) {
            return ctx.badRequest("Debe enviar al menos un producto.");
        }

        try {
            const lineItems = await Promise.all(
                products.map(async (item) => {
                    // Buscar el producto en Strapi
                    const product = await strapi.entityService.findOne("api::product.product", item.id);

                    if (!product) {
                        throw new Error(`El producto con ID ${item.id} no existe.`);
                    }

                    return {
                        price_data: {
                            currency: "mxn",
                            product_data: {
                                name: product.productName
                            },
                            unit_amount: Math.round(product.price * 100) // Stripe requiere el precio en centavos
                        },
                        quantity: 1
                    };
                })
            );

            // Crear la sesión de pago en Stripe
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                mode: "payment",
                success_url: `${process.env.CLIENT_URL}/success`,
                cancel_url: `${process.env.CLIENT_URL}/successError`,
                line_items: lineItems
            });

            // Guardar la venta en la base de datos de Strapi
            const nuevaVenta = await strapi.entityService.create("api::venta.venta", {
                data: {
                    idVenta: session.id, // Guardamos el ID de la sesión de pago
                    products // Guardamos el array de productos
                }
            });

            return ctx.send({ stripeSession: session, venta: nuevaVenta });

        } catch (error) {
            console.error("Error en la API de Strapi:", error);
            ctx.response.status = 500;
            return ctx.send({ error: error.message });
        }
    }
}))