import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { PayButton } from "@/components/students/pay-button";

export default async function PublicDepartmentPage({
  params,
  searchParams,
}: {
  params: { departmentSlug: string };
  searchParams: { type?: string };
}) {
  const department = await prisma.department.findUnique({
    where: { slug: params.departmentSlug },
    include: { academicSession: true },
  });

  if (!department) return notFound();
  // Archived departments keep their history but no longer accept new
  // payments - the public link goes dark rather than silently accepting
  // money into a department that's no longer active.
  if (department.status === "ARCHIVED") return notFound();

  // `?type=FRESHER` / `?type=CONTINUING` deep links (generated and
  // distributed from the admin side - see department-admin-client.tsx) skip
  // straight to that one payment form instead of the two-card chooser, and
  // open the form itself rather than making the student click "Pay Now"
  // first, since finding the form IS the point of following the link.
  const requestedType = searchParams.type === "FRESHER" || searchParams.type === "CONTINUING" ? searchParams.type : null;

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

        {requestedType ? (
          <div className="mx-auto grid max-w-xs grid-cols-1 gap-10 mt-4 sm:mt-6">
            <DuesCard
              title={requestedType === "FRESHER" ? "First Year Students" : "Continuing Students"}
              amount={Number(requestedType === "FRESHER" ? department.fresherAmount : department.continuingAmount)}
              departmentSlug={department.slug}
              paymentType={requestedType}
              autoOpen
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-10 sm:gap-48 mt-4 sm:mt-6 md:grid-cols-2">
            <DuesCard
              title="First Year Students"
              amount={Number(department.fresherAmount)}
              departmentSlug={department.slug}
              paymentType="FRESHER"
            />

            <DuesCard
              title="Continuing Students"
              amount={Number(department.continuingAmount)}
              departmentSlug={department.slug}
              paymentType="CONTINUING"
            />
          </div>
        )}
      </div>
    </main>
  );
}

function DuesCard({
  title,
  amount,
  departmentSlug,
  paymentType,
  autoOpen,
}: {
  title: string;
  amount: number;
  departmentSlug: string;
  paymentType: "FRESHER" | "CONTINUING";
  autoOpen?: boolean;
}) {
  return (
    <div className="portal-card flex flex-col items-center space-y-3 p-4 sm:space-y-4 sm:p-6">
      <h2 className="text-sm font-semibold text-portal-text sm:text-lg">{title}</h2>
      <p className="text-xl font-bold text-portal-accent sm:text-3xl">GHS {amount.toLocaleString()}</p>
      <PayButton departmentSlug={departmentSlug} paymentType={paymentType} autoOpen={autoOpen} />
    </div>
  );
}
