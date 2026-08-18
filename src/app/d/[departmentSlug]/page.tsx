import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { PayButton } from "@/components/students/pay-button";
import QRCode from "qrcode";

export default async function PublicDepartmentPage({ params }: { params: { departmentSlug: string } }) {
  const department = await prisma.department.findUnique({
    where: { slug: params.departmentSlug },
    include: { academicSession: true },
  });

  if (!department) return notFound();
  // Archived departments keep their history but no longer accept new
  // payments - the public link goes dark rather than silently accepting
  // money into a department that's no longer active.
  if (department.status === "ARCHIVED") return notFound();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const fresherUrl = `${baseUrl}/d/${department.slug}?type=FRESHER`;
  const continuingUrl = `${baseUrl}/d/${department.slug}?type=CONTINUING`;

  const [fresherQr, continuingQr] = await Promise.all([
    QRCode.toDataURL(fresherUrl, { margin: 1, color: { dark: "#0f9b8e", light: "#ffffff" } }),
    QRCode.toDataURL(continuingUrl, { margin: 1, color: { dark: "#0f9b8e", light: "#ffffff" } }),
  ]);

  return (
    <main className="portal-shell flex flex-col items-center px-4 py-12">
      <div className="portal-content w-full max-w-3xl space-y-8 text-center">
        <div className="space-y-3">
          <div className="portal-crest">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/school-crest.png" alt="University of Mines and Technology crest" />
          </div>
          <div>
            <p
              className="text-sm font-bold uppercase tracking-widest sm:text-base"
              style={{ color: "#0b7a70", textShadow: "0 2px 6px rgba(255,255,255,0.85), 0 1px 2px rgba(255,255,255,0.9)" }}
            >
              University Of Mines And Technology
            </p>
            <p
              className="text-sm font-bold uppercase tracking-widest sm:text-base"
              style={{ color: "#0b7a70", textShadow: "0 2px 6px rgba(255,255,255,0.85), 0 1px 2px rgba(255,255,255,0.9)" }}
            >
              Essikado Campus
            </p>
            <p className="mt-1 text-base font-semibold text-black sm:text-lg">
              Departmental Dues · {department.academicSession.name}
            </p>
          </div>
          <h1 className="text-2xl font-bold uppercase text-portal-text">{department.name}</h1>
          {department.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={department.logoUrl} alt={`${department.name} logo`} className="portal-dept-logo" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-5 sm:gap-24">
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
    <div className="portal-card flex flex-col items-center space-y-3 p-4 sm:space-y-4 sm:p-6">
      <h2 className="text-sm font-semibold text-portal-text sm:text-lg">{title}</h2>
      <p className="text-xl font-bold text-portal-accent sm:text-3xl">GHS {amount.toLocaleString()}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qr}
        alt={`QR code for ${title}`}
        className="h-24 w-24 rounded-md border border-portal-border p-1.5 sm:h-40 sm:w-40 sm:p-2"
      />
      <PayButton departmentSlug={departmentSlug} paymentType={paymentType} />
      <a href={link} className="block break-all text-[10px] text-portal-muted underline sm:text-xs">{link}</a>
    </div>
  );
}
