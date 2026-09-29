import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../../components/layout/AppLayout";
import Button from "../../components/button/Button";
import Input from "../../components/input/Input";
import ErrorMessage from "../../components/error-message/ErrorMessage";
import api from "../../utils/axiosInstance";

export default function TutorApplication() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    courseId: "",
    courseMark: "",
    hourlyRate: "",
    maxHoursPerWeek: "",
  });
  const [success, setSuccess] = useState(false);
  const [appliedCourseCode, setAppliedCourseCode] = useState("");
  const [eligibleCourses, setEligibleCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Courses the student can tutor without their availability clashing with
  // the course's session slots (the lecturer specifies those slots).
  useEffect(() => {
    let cancelled = false;

    const fetchEligibleCourses = async () => {
      try {
        const res = await api.get("/onboarding/tutor-eligible-courses");
        if (!cancelled && res.status === 200) {
          setEligibleCourses(res.data.eligibleCourses || []);
        }
      } catch {
        if (!cancelled) {
          setCoursesError("Could not load courses. Please refresh the page and try again.");
        }
      } finally {
        if (!cancelled) {
          setCoursesLoading(false);
        }
      }
    };

    fetchEligibleCourses();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCourse = eligibleCourses.find((c) => String(c.id) === String(form.courseId));

  const handleChange = (e, name) => {
    setError("");
    setForm((prev) => ({ ...prev, [name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const mark = Number(form.courseMark);
    if (!form.courseId) {
      return setError("Please select the course you want to tutor.");
    }
    if (!form.courseMark || isNaN(mark) || mark < 0 || mark > 100) {
      return setError("Please enter a valid course mark between 0 and 100.");
    }
    if (selectedCourse && mark < selectedCourse.minimumMark) {
      return setError(
        `Your mark (${mark}) is below the minimum required mark (${selectedCourse.minimumMark}) for ${selectedCourse.courseCode}.`,
      );
    }
    if (
      !form.maxHoursPerWeek ||
      Number(form.maxHoursPerWeek) < 1 ||
      Number(form.maxHoursPerWeek) > 40
    ) {
      return setError("Maximum hours per week is required and must be between 1 and 40.");
    }

    const payload = {
      requestedRole: "TUTOR",
      courseId: Number(form.courseId),
      courseMark: mark,
      hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
      maxHoursPerWeek: Number(form.maxHoursPerWeek),
    };

    setSubmitting(true);
    try {
      const res = await api.post("/onboarding/apply", payload);
      if (res?.status === 201) {
        setAppliedCourseCode(selectedCourse?.courseCode || "");
        setSuccess(true);
      } else {
        // The axios instance resolves every HTTP status, so refusals such
        // as the 409 duplicate-application error arrive here, not in catch.
        setError(res?.data?.message || "Something went wrong! Please try again later.");
      }
    } catch {
      // Only network-level failures reject here.
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <AppLayout title="Tutor Application" showSearch={false}>
        <div className="p-stack-md md:p-margin-page max-w-container-max mx-auto w-full">
          <div className="bg-surface-container-lowest p-stack-lg rounded-xl border border-outline-variant shadow-bento text-center">
            <span className="material-symbols-outlined text-5xl text-trust-blue mb-stack-md">check_circle</span>
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-unit">Application Submitted!</h2>
            <p className="font-body-md text-on-surface-variant mb-stack-lg">
              Your tutor application
              {appliedCourseCode ? ` for ${appliedCourseCode}` : ""} has been submitted and is pending
              review by an organiser.
            </p>
            <div className="flex justify-center gap-stack-md">
              <button
                onClick={() => navigate("/onboarding")}
                className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity"
              >
                Back to Onboarding
              </button>
              <button
                onClick={() => navigate("/volunteer")}
                className="bg-surface-container-high text-on-surface px-6 py-2 rounded-lg font-label-caps text-label-caps hover:bg-surface-variant transition-colors border border-outline-variant"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Tutor Application" showSearch={false}>
      <div className="p-stack-md md:p-margin-page max-w-container-max mx-auto w-full">
        <div className="mb-stack-lg">
          <button
            onClick={() => navigate("/onboarding")}
            className="flex items-center gap-unit text-on-surface-variant hover:text-primary transition-colors mb-stack-md font-body-sm"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Onboarding
          </button>
          <h2 className="font-display text-display text-primary mb-unit">Apply to Become a Tutor</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Choose the course you want to tutor and provide your tutoring preferences below. An
            organiser will review your application and availability before making a decision.
          </p>
        </div>

        <div className="bg-surface-container-lowest p-stack-lg rounded-xl border border-outline-variant shadow-bento">
          {coursesLoading && (
            <div className="space-y-stack-sm mb-stack-md" aria-hidden="true">
              <div className="animate-pulse h-4 w-56 rounded bg-surface-container-high" />
              <div className="animate-pulse h-11 rounded bg-surface-container-high/60" />
              <div className="animate-pulse h-11 rounded bg-surface-container-high/60" />
            </div>
          )}

          {coursesError && (
            <div className="mb-stack-md">
              <ErrorMessage>{coursesError}</ErrorMessage>
            </div>
          )}

          {!coursesLoading && !coursesError && eligibleCourses.length === 0 && (
            <div className="bg-error/10 border border-error/30 rounded-lg p-stack-md mb-stack-md">
              <p className="font-body-md text-on-surface-variant flex items-start gap-unit">
                <span className="material-symbols-outlined text-error text-[18px] shrink-0 mt-0.5">
                  event_busy
                </span>
                <span>
                  There are currently no courses whose session slots fit your availability. Add more
                  available time slots on your{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/timetable/edit")}
                    className="text-primary underline underline-offset-2"
                  >
                    timetable
                  </button>{" "}
                  and come back.
                </span>
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-stack-md">
            {!coursesLoading && eligibleCourses.length > 0 && (
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                  Course to Tutor <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <span className="material-symbols-outlined text-outline text-lg">school</span>
                  </div>
                  <select
                    value={form.courseId}
                    onChange={(e) => handleChange(e, "courseId")}
                    className="w-full rounded-DEFAULT border-outline-variant bg-surface py-2 font-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-colors h-11 shadow-sm pl-10 pr-8 appearance-none"
                  >
                    <option value="">Select a course...</option>
                    {eligibleCourses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.courseCode} - {course.courseName} (min mark: {course.minimumMark}%)
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <span className="material-symbols-outlined text-outline text-lg">
                      expand_more
                    </span>
                  </div>
                </div>
                <p className="font-body-sm text-outline mt-unit">
                  Required. Only courses whose session slots do not clash with your availability are
                  listed.
                </p>
              </div>
            )}

            {!coursesLoading && eligibleCourses.length > 0 && (
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                  Final Mark for{" "}
                  {selectedCourse ? selectedCourse.courseCode : "the Selected Course"}{" "}
                  <span className="text-error">*</span>
                </label>
                <Input
                  type="number"
                  placeholder={selectedCourse ? `${selectedCourse.minimumMark} or higher` : "75"}
                  value={form.courseMark}
                  onChange={(e) => handleChange(e, "courseMark")}
                  icon="grade"
                />
                <p className="font-body-sm text-outline mt-unit">
                  Required{selectedCourse ? `: must be at least ${selectedCourse.minimumMark}% for ${selectedCourse.courseCode}` : ""}.
                </p>
              </div>
            )}

            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                Hourly Rate (ZAR)
              </label>
              <Input
                type="number"
                placeholder="150"
                value={form.hourlyRate}
                onChange={(e) => handleChange(e, "hourlyRate")}
                icon="payments"
              />
              <p className="font-body-sm text-outline mt-unit">
                Optional. Your preferred hourly rate. The organiser may adjust this during approval.
              </p>
            </div>

            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                Maximum Hours per Week <span className="text-error">*</span>
              </label>
              <Input
                type="number"
                placeholder="10"
                value={form.maxHoursPerWeek}
                onChange={(e) => handleChange(e, "maxHoursPerWeek")}
                icon="schedule"
              />
              <p className="font-body-sm text-outline mt-unit">
                Required. The maximum number of tutoring hours you can commit to each week (1-40).
              </p>
            </div>

            <div className="bg-primary-fixed/30 border border-primary/20 rounded-lg p-stack-md">
              <p className="font-body-sm text-on-surface-variant flex items-start gap-unit">
                <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">info</span>
                <span>
                  Your availability has already been configured and is used to filter the course list
                  above. You can update your availability at any time from your Profile.
                </span>
              </p>
            </div>

            {error && <ErrorMessage>{error}</ErrorMessage>}

            <div className="flex gap-stack-md pt-stack-sm">
              <Button
                type="submit"
                disabled={
                  !form.courseId ||
                  !form.courseMark ||
                  Number(form.courseMark) < 0 ||
                  Number(form.courseMark) > 100 ||
                  (selectedCourse && Number(form.courseMark) < selectedCourse.minimumMark) ||
                  !form.maxHoursPerWeek ||
                  Number(form.maxHoursPerWeek) < 1 ||
                  Number(form.maxHoursPerWeek) > 40
                }
                loading={submitting}
              >
                Submit Application
              </Button>
              <button
                type="button"
                onClick={() => navigate("/onboarding")}
                className="px-6 py-2 border border-outline-variant text-on-surface rounded-lg font-label-caps text-label-caps hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
