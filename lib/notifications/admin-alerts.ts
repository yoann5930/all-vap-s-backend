import prisma from "@/lib/prisma";

export async function createAdminAlert(params: {
  type: string;
  level: string;
  title: string;
  description: string;
  orderId?: string;
  productId?: string;
  recommendedAction?: string;
  adminPath?: string;
  isTest?: boolean;
}) {
  return prisma.adminAlert.create({
    data: {
      type: params.type,
      level: params.level,
      title: params.title,
      description: params.description,
      orderId: params.orderId,
      productId: params.productId,
      recommendedAction: params.recommendedAction,
      adminPath: params.adminPath || "/admin/alertes",
      isTest: !!params.isTest,
      status: "open",
    },
  });
}
