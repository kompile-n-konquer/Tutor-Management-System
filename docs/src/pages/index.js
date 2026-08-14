import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <main className={styles.heroBanner}>
        <div className="container">
          <Heading as="h1" className="hero__title">
            {siteConfig.title}
          </Heading>
          <p className="hero__subtitle">{siteConfig.tagline}</p>
          <article className={styles.intro}>
            <h2>Introduction</h2>
            <p>
              Welcome to the documentation for the <strong>Tutor Management System</strong> - a platform built for the University of the Witwatersrand's School of Computer Science and Applied Mathematics, developed as part of COMS3011A Project 1.
            </p>
            <h3>What is this?</h3>
            <p>
              The Tutor Management System helps an organiser assign tutors to courses based on their marks, availability, and weekly hour limits, all from a single allocation board. It also lets:
            </p>
            <ul>
              <li><strong>Tutors</strong> log their hours, submit timesheets, and excuse themselves from sessions they can't make</li>
              <li><strong>Students</strong> apply to tutor and volunteer for overflow work</li>
              <li><strong>Organisers</strong> manage allocations, approve timesheets, and track hours across the school</li>
            </ul>
            <h3>Who this documentation is for</h3>
            <ul>
              <li><strong>Team members</strong> setting up the project locally or contributing a feature</li>
              <li><strong>Markers/reviewers</strong> wanting to understand the system's architecture and data model</li>
              <li><strong>Anyone</strong> curious how the platform is structured</li>
            </ul>
            <p>
              <em>Built by Mogomotsi Motoma, Nduvho Mulaudzi, Kgaogelo Mohlala, Ndumiso Skhosana, Nhlamulo Mabuza, and Tlhalefo Sebaeng.</em>
            </p>
          </article>
        </div>
      </main>
    </Layout>
  );
}
