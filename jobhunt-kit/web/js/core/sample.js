// The example person from the Python workspace template (jobhunt/scaffold/workspace/resume.yaml), for "try it out".
export const SAMPLE_RESUME = {
  basics: { name: "Alex Chen", email: "alex.chen@example.com", phone: "+1 412 555 0100", location: "Pittsburgh, PA",
    links: [{ label: "linkedin.com/in/alexchen-example", url: "https://www.linkedin.com/in/alexchen-example" },
            { label: "github.com/alexchen-example", url: "https://github.com/alexchen-example" }] },
  variants: {},
  summary: { default: "M.S. Robotics student who ships tested robot software. Built a motion planner used on 6 warehouse robots and a simulation test suite that catches regressions before field tests." },
  education: [
    { school: "Carnegie Mellon University", location: "Pittsburgh, PA", degree: "M.S. in Robotics", dates: "Aug 2026 – May 2028", details: ["Coursework: Planning, Computer Vision, Optimal Control"] },
    { school: "National Taiwan University", location: "Taipei, Taiwan", degree: "B.S. in Mechanical Engineering", dates: "Sep 2020 – Jun 2024" },
  ],
  experience: [
    { id: "acme", org: "Acme Robotics", role: "Robotics Software Intern", location: "Boston, MA", dates: "Jun 2025 – Aug 2025", bullets: [
      { id: "acme_planner", text: "Wrote a C++ motion planner for 6 warehouse robots that cut average path time by 18%." },
      { id: "acme_sim", text: "Built a Gazebo test suite of 40 scenarios that runs on every pull request." },
      { id: "acme_ros", text: "Moved 3 ROS 1 nodes to ROS 2 and wrote the launch and parameter files." } ] },
    { id: "lab", org: "NTU Robot Learning Lab", role: "Undergraduate Researcher", location: "Taipei, Taiwan", dates: "Sep 2022 – Jun 2024", bullets: [
      { id: "lab_detector", text: "Trained a YOLO detector for pallet detection and got it to 30 FPS on a Jetson Orin with TensorRT." },
      { id: "lab_eval", text: "Built the evaluation pipeline that compared 12 model versions on the same 2,000 labeled images." } ] },
  ],
  projects: [
    { id: "drone", name: "Drone racing policy", link: "https://github.com/alexchen-example/drone-racing", dates: "2025", bullets: [
      { id: "drone_policy", text: "Trained a PPO policy in simulation that finishes a 7-gate track in 9.4 s." },
      { id: "drone_eval", text: "Ran a 3-seed ablation and reported which design choices mattered and which did not." } ] },
    { id: "tasks", name: "Team task tracker", link: "https://github.com/alexchen-example/tasks", dates: "2024", bullets: [
      { id: "tasks_api", text: "Built a Flask and PostgreSQL web app used by 25 lab members to track experiments." } ] },
  ],
  skills: [
    { label: "Languages", items: ["C++", "Python", "SQL"] },
    { label: "Robotics", items: ["ROS 2", "Gazebo", "motion planning", "state estimation"] },
    { label: "ML", items: ["PyTorch", "TensorRT", "reinforcement learning (PPO)"] },
    { label: "Tools", items: ["Git", "Docker", "Linux", "GitHub Actions"] },
  ],
};

export function emptyResume() {
  return { basics: { name: "", email: "", phone: "", location: "", links: [] }, variants: {}, summary: { default: "" },
    education: [], experience: [], projects: [], skills: [] };
}
