-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_isActive_category_idx" ON "Product"("isActive", "category");
CREATE INDEX IF NOT EXISTS "Product_isActive_isPromo_idx" ON "Product"("isActive", "isPromo");
CREATE INDEX IF NOT EXISTS "Product_isActive_isBestSeller_idx" ON "Product"("isActive", "isBestSeller");
CREATE INDEX IF NOT EXISTS "Product_isActive_isNew_idx" ON "Product"("isActive", "isNew");
CREATE INDEX IF NOT EXISTS "Product_salesCount_idx" ON "Product"("salesCount");
CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX IF NOT EXISTS "Product_brandId_idx" ON "Product"("brandId");
CREATE INDEX IF NOT EXISTS "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_customerEmail_idx" ON "Order"("customerEmail");
CREATE INDEX IF NOT EXISTS "Order_userId_idx" ON "Order"("userId");
