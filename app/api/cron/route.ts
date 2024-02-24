import Product from "@/lib/models/product.model";
import { connectToDB } from "@/lib/mongoose";
import { generateEmailBody, sendEmail } from "@/lib/nodemailer";
import { scrapeAmazonProduct } from "@/lib/scraper";
import { getAveragePrice, getEmailNotifType, getHighestPrice, getLowestPrice } from "@/lib/utils";
import { NextResponse } from "next/server";

// export const maxDuration = 9; //seconds
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
    try {
        connectToDB();

        const products = await Product.find({});

        if(!products) throw new Error('No products found');

        // 1) scrape latest product details and update DB

        const updatedProducts = await Promise.all(
            products.map(async (currentProcut) => {
                const scrapedProduct = await scrapeAmazonProduct(currentProcut.url);

                if(!scrapedProduct) return new Error("No product scraped!");

                const updatedPriceHistory  = [
                    ...currentProcut.priceHistory,
                    {
                        price : scrapedProduct.currentPrice
                    }
                ];
                const product = {
                    ...scrapedProduct,
                    priceHistory : updatedPriceHistory,
                    lowerPrice : getLowestPrice(updatedPriceHistory),
                    highestPrice : getHighestPrice(updatedPriceHistory),
                    averagePrice : getAveragePrice(updatedPriceHistory),
    
                }
            const updatedProduct = await Product.findOneAndUpdate({ 
                url : product.url}, 
                product,
            );

            // 2) check each product's status and send email accordinly

            const emailNotifType = getEmailNotifType(scrapedProduct, currentProcut);

            if(emailNotifType && updatedProduct.users.length > 0) {
                const productInfo = {
                    title : updatedProduct.title,
                    url : updatedProduct.url,
                }

                const emailContent = await generateEmailBody(productInfo, emailNotifType);

                const userEmails = updatedProduct.users.map((user : any) => user.email);

                await sendEmail(emailContent, userEmails);
            }
                return updatedProduct;
            })
        )
        return NextResponse.json({
            message : 'Ok', data : updatedProducts
        })
    } catch (error) {
        throw new Error(`Error in GET:${error}`);
    }
}