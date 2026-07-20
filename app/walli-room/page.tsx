"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function WalliRoom() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({
    trash: 127,
    artifacts: 12,
    rare: 3,
    earned: 247.50,
    level: 5,
    skill: 78
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 2, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    const containerGroup = new THREE.Group();
    scene.add(containerGroup);

    const wallMat = new THREE.MeshPhysicalMaterial({ color: 0x3A3A3A, roughness: 0.9, metalness: 0.1 });
    const floorMat = new THREE.MeshPhysicalMaterial({ color: 0x5C3A21, roughness: 0.9, metalness: 0.3 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    containerGroup.add(floor);

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), wallMat);
    backWall.position.set(0, 1.5, -4);
    containerGroup.add(backWall);

    const trashMat = new THREE.MeshPhysicalMaterial({ color: 0x8B7D6B, roughness: 0.9 });
    for (let i = 0; i < 30; i++) {
      const trash = new THREE.Mesh(
        new THREE.BoxGeometry(0.05 + Math.random() * 0.15, 0.05 + Math.random() * 0.15, 0.05 + Math.random() * 0.15),
        trashMat
      );
      trash.position.set((Math.random() - 0.5) * 6, -0.45 + Math.random() * 0.1, (Math.random() - 0.5) * 6);
      trash.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      containerGroup.add(trash);
    }

    const walliGroup = new THREE.Group();
    const yellowMat = new THREE.MeshPhysicalMaterial({ color: 0xD4A017, roughness: 0.7, metalness: 0.3 });
    const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x3A3A3A, roughness: 0.8, metalness: 0.2 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00BFFF });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), yellowMat);
    body.position.y = 0.5;
    walliGroup.add(body);

    const eyeGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8);
    const leftEye = new THREE.Mesh(eyeGeo, glowMat);
    leftEye.position.set(-0.12, 0.6, 0.32);
    leftEye.rotation.x = 0.2;
    walliGroup.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, glowMat);
    rightEye.position.set(0.12, 0.6, 0.32);
    rightEye.rotation.x = 0.2;
    walliGroup.add(rightEye);

    const trackGeo = new THREE.BoxGeometry(0.15, 0.08, 0.6);
    const leftTrack = new THREE.Mesh(trackGeo, darkMat);
    leftTrack.position.set(-0.35, 0.05, 0);
    walliGroup.add(leftTrack);
    const rightTrack = new THREE.Mesh(trackGeo, darkMat);
    rightTrack.position.set(0.35, 0.05, 0);
    walliGroup.add(rightTrack);

    const antennaGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.2);
    const antenna = new THREE.Mesh(antennaGeo, darkMat);
    antenna.position.set(0, 0.9, 0);
    walliGroup.add(antenna);
    const lightGeo = new THREE.SphereGeometry(0.03, 6, 6);
    const antennaLight = new THREE.Mesh(lightGeo, glowMat);
    antennaLight.position.set(0, 1.0, 0);
    walliGroup.add(antennaLight);

    const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.2);
    const rightArm = new THREE.Mesh(armGeo, yellowMat);
    rightArm.position.set(0.4, 0.45, 0);
    rightArm.rotation.z = -0.3;
    walliGroup.add(rightArm);

    const clawGeo = new THREE.BoxGeometry(0.04, 0.08, 0.04);
    const claw = new THREE.Mesh(clawGeo, darkMat);
    claw.position.set(0.5, 0.35, 0);
    walliGroup.add(claw);

    containerGroup.add(walliGroup);

    const sunLight = new THREE.DirectionalLight(0xFF8844, 1.5);
    sunLight.position.set(3, 4, 2);
    containerGroup.add(sunLight);
    containerGroup.add(new THREE.AmbientLight(0x442211, 0.5));

    let time = 0;
    let rafId = 0;
    function animate() {
      rafId = requestAnimationFrame(animate);
      time += 0.01;
      walliGroup.position.x = Math.sin(time * 0.5) * 2;
      walliGroup.position.z = Math.cos(time * 0.7) * 1.5;
      walliGroup.rotation.y = Math.sin(time * 0.3) * 0.1;
      const lv = Math.sin(time * 3) * 0.5 + 0.5;
      ;(antennaLight.material as THREE.MeshBasicMaterial).color.setHSL(0.55, 1, lv * 0.5 + 0.3);
      renderer.render(scene, camera);
    }
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#1a0e08]">
      <div ref={containerRef} className="w-full h-[calc(100vh-200px)]" />
      <div className="fixed bottom-0 left-0 right-0 bg-[#0A0A0F]/90 backdrop-blur-lg border-t border-[#D4A017]/30 p-4">
        <div className="max-w-6xl mx-auto grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
          <div><p className="text-xs text-gray-400">🧹 Мусора</p><p className="text-lg font-bold text-[#D4A017]">{stats.trash}</p></div>
          <div><p className="text-xs text-gray-400">📦 Артефактов</p><p className="text-lg font-bold text-[#D4A017]">{stats.artifacts}</p></div>
          <div><p className="text-xs text-gray-400">⭐ Редких</p><p className="text-lg font-bold text-[#D4A017]">{stats.rare}</p></div>
          <div><p className="text-xs text-gray-400">💰 Заработано</p><p className="text-lg font-bold text-[#D4A017]">∞ {stats.earned}</p></div>
          <div><p className="text-xs text-gray-400">📈 Уровень</p><p className="text-lg font-bold text-[#D4A017]">{stats.level}</p></div>
          <div><p className="text-xs text-gray-400">🔧 Навык</p><p className="text-lg font-bold text-[#D4A017]">{stats.skill}%</p></div>
        </div>
      </div>
    </div>
  );
}
