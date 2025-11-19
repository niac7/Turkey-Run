
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { LANE_WIDTH } from '../../types';

const FallingLeaves: React.FC = () => {
  const speed = useStore(state => state.speed);
  const count = 800; 
  const meshRef = useRef<THREE.Points>(null);
  
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const colorPalette = [
        new THREE.Color('#ff4500'), // OrangeRed
        new THREE.Color('#ffd700'), // Gold
        new THREE.Color('#8b4500'), // Dark Orange
        new THREE.Color('#cd853f'), // Peru
    ];

    for (let i = 0; i < count; i++) {
      let x = (Math.random() - 0.5) * 300;
      let y = Math.random() * 100; 
      let z = -300 + Math.random() * 350;

      pos[i * 3] = x;     
      pos[i * 3 + 1] = y; 
      pos[i * 3 + 2] = z; 

      const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    return { pos, colors };
  }, []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    const positions = meshRef.current.geometry.attributes.position.array as Float32Array;
    const activeSpeed = speed > 0 ? speed : 5;

    for (let i = 0; i < count; i++) {
        // Move Z (forward relative to player)
        positions[i * 3 + 2] += activeSpeed * delta * 1.5; 
        // Fall Y
        positions[i * 3 + 1] -= delta * 2;
        // Sway X
        positions[i * 3] += Math.sin(state.clock.elapsedTime + i) * 0.05;

        if (positions[i * 3 + 2] > 50 || positions[i * 3 + 1] < 0) {
            positions[i * 3 + 2] = -300 - Math.random() * 50;
            positions[i * 3 + 1] = 50 + Math.random() * 20;
            positions[i * 3] = (Math.random() - 0.5) * 300;
        }
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions.pos} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={positions.colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.8} vertexColors transparent opacity={0.8} sizeAttenuation />
    </points>
  );
};

const LaneGuides: React.FC = () => {
    const { laneCount } = useStore();
    
    const separators = useMemo(() => {
        const lines: number[] = [];
        const startX = -(laneCount * LANE_WIDTH) / 2;
        for (let i = 0; i <= laneCount; i++) {
            lines.push(startX + (i * LANE_WIDTH));
        }
        return lines;
    }, [laneCount]);

    return (
        <group position={[0, 0.02, 0]}>
            {/* Dirt Road Floor */}
            <mesh position={[0, -0.02, -20]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[laneCount * LANE_WIDTH, 200]} />
                <meshStandardMaterial color="#3b2716" roughness={1} />
            </mesh>

            {/* Lane Separators - Orange Painted Lines */}
            {separators.map((x, i) => (
                <mesh key={`sep-${i}`} position={[x, 0, -20]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[0.08, 200]} /> 
                    <meshBasicMaterial color="#d2691e" transparent opacity={0.6} />
                </mesh>
            ))}
        </group>
    );
};

const HarvestSun: React.FC = () => {
    return (
        <group position={[0, 30, -180]}>
            <mesh>
                <circleGeometry args={[40, 32]} />
                <meshBasicMaterial color="#ffae00" />
            </mesh>
            {/* Glow */}
            <mesh position={[0, 0, -1]} scale={[1.2, 1.2, 1]}>
                <circleGeometry args={[40, 32]} />
                <meshBasicMaterial color="#ff4500" transparent opacity={0.3} />
            </mesh>
        </group>
    );
};

const Ground: React.FC = () => {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, -100]}>
            <planeGeometry args={[500, 500]} />
            <meshStandardMaterial color="#1a1005" roughness={1} />
        </mesh>
    );
};

export const Environment: React.FC = () => {
  return (
    <>
      <color attach="background" args={['#1a0500']} />
      <fog attach="fog" args={['#2e1005', 30, 140]} />
      
      <ambientLight intensity={0.6} color="#ffd700" />
      <directionalLight position={[20, 50, -20]} intensity={1.2} color="#ffae00" castShadow />
      <pointLight position={[0, 10, -10]} intensity={0.5} color="#ff4500" distance={50} />
      
      <FallingLeaves />
      <Ground />
      <LaneGuides />
      <HarvestSun />
    </>
  );
};
