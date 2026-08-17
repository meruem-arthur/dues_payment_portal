import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { PayButton } from "@/components/students/pay-button";
import QRCode from "qrcode";
import { GraduationCap } from "lucide-react";

export default async function PublicDepartmentPage({ params }: { params: { departmentSlug: string } }) {
  const department = await prisma.department.findUnique({
    where: { slug: params.departmentSlug },
    include: { academicSession: true },
  });

  if (!department) return notFound();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const fresherUrl = `${baseUrl}/d/${department.slug}?type=FRESHER`;
  const continuingUrl = `${baseUrl}/d/${department.slug}?type=CONTINUING`;

  const [fresherQr, continuingQr] = await Promise.all([
    QRCode.toDataURL(fresherUrl, { margin: 1, color: { dark: "#0f9b8e", light: "#ffffff" } }),
    QRCode.toDataURL(continuingUrl, { margin: 1, color: { dark: "#0f9b8e", light: "#ffffff" } }),
  ]);

  return (
    <main className="portal-shell flex flex-col items-center px-4 py-12">
      <div className="portal-content w-full max-w-md space-y-8 text-center">
        <div className="space-y-3">
          <div className="portal-crest">
            <GraduationCap size={28} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-portal-muted">
              University of Mines and Technology
            </p>
            <p className="text-xs text-portal-muted">Departmental Dues · {department.academicSession.name}</p>
          </div>
          <h1 className="text-2xl font-bold uppercase text-portal-text">{department.name}</h1>
        </div>

        <DuesCard
          title="First Year Students"
          amount={Number(department.fresherAmount)}
          qr={fresherQr}
          link={fresherUrl}
          departmentSlug={department.slug}
          paymentType="FRESHER"
        />

        <DuesCard
          title="Continuing Students"
          amount={Number(department.continuingAmount)}
          qr={continuingQr}
          link={continuingUrl}
          departmentSlug={department.slug}
          paymentType="CONTINUING"
        />
      </div>
    </main>
  );
}

function DuesCard({
  title,
  amount,
  qr,
  link,
  departmentSlug,
  paymentType,
}: {
  title: string;
  amount: number;
  qr: string;
  link: string;
  departmentSlug: string;
  paymentType: "FRESHER" | "CONTINUING";
}) {
  return (
    <div className="portal-card space-y-4 p-6">
      <h2 className="text-lg font-semibold text-portal-text">{title}</h2>
      <p className="text-3xl font-bold text-portal-accent">GHS {amount.toLocaleString()}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt={`QR code for ${title}`} className="mx-auto h-40 w-40 rounded-md border border-portal-border p-2" />
      <PayButton departmentSlug={departmentSlug} paymentType={paymentType} />
      <a href={link} className="block break-all text-xs text-portal-muted underline">{link}</a>
    </div>
  );
}
