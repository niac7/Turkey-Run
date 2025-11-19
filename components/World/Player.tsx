
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { LANE_WIDTH, GameStatus } from '../../types';
import { audio } from '../System/Audio';

// Physics Constants
const GRAVITY = 50;
const JUMP_FORCE = 16; 

// Turkey Geometries
const BODY_GEO = new THREE.SphereGeometry(0.4, 16, 16);
const NECK_GEO = new THREE.CylinderGeometry(0.1, 0.15, 0.3, 8);
const HEAD_GEO = new THREE.SphereGeometry(0.2, 12, 12);
const BEAK_GEO = new THREE.ConeGeometry(0.08, 0.2, 8);
const WATTLE_GEO = new THREE.SphereGeometry(0.08, 8, 8);
const LEG_GEO = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
const FOOT_GEO = new THREE.BoxGeometry(0.2, 0.05, 0.25);
const WING_GEO = new THREE.BoxGeometry(0.1, 0.4, 0.4);
const TAIL_FEATHER_GEO = new THREE.BoxGeometry(0.2, 0.8, 0.05);
const SHADOW_GEO = new THREE.CircleGeometry(0.5, 32);

export const Player: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  
  // Animation Refs
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftWingRef = useRef<THREE.Group>(null);
  const rightWingRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);

  const { status, laneCount, takeDamage, hasDoubleJump, activateImmortality, isImmortalityActive } = useStore();
  
  const [lane, setLane] = React.useState(0);
  const targetX = useRef(0);
  
  // Physics State
  const isJumping = useRef(false);
  const velocityY = useRef(0);
  const jumpsPerformed = useRef(0); 
  const spinRotation = useRef(0);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const isInvincible = useRef(false);
  const lastDamageTime = useRef(0);

  // Memoized Materials
  const { bodyMat, featherMat1, featherMat2, featherMat3, beakMat, wattleMat, legMat, shadowMaterial } = useMemo(() => {
      const glow = isImmortalityActive ? 0.5 : 0;
      return {
          bodyMat: new THREE.MeshStandardMaterial({ color: '#8b4513', roughness: 0.8, emissive: '#8b4513', emissiveIntensity: glow }), // Saddle Brown
          featherMat1: new THREE.MeshStandardMaterial({ color: '#cd5c5c', roughness: 0.9 }), // Indian Red
          featherMat2: new THREE.MeshStandardMaterial({ color: '#d2691e', roughness: 0.9 }), // Chocolate
          featherMat3: new THREE.MeshStandardMaterial({ color: '#daa520', roughness: 0.9 }), // Goldenrod
          beakMat: new THREE.MeshStandardMaterial({ color: '#ffcc00', roughness: 0.4 }),
          wattleMat: new THREE.MeshStandardMaterial({ color: '#ff0000', roughness: 0.3 }),
          legMat: new THREE.MeshStandardMaterial({ color: '#ff8c00', roughness: 0.6 }), // Dark Orange
          shadowMaterial: new THREE.MeshBasicMaterial({ color: '#331100', opacity: 0.4, transparent: true })
      };
  }, [isImmortalityActive]);

  useEffect(() => {
      if (status === GameStatus.PLAYING) {
          isJumping.current = false;
          jumpsPerformed.current = 0;
          velocityY.current = 0;
          spinRotation.current = 0;
          if (groupRef.current) groupRef.current.position.y = 0;
          if (bodyRef.current) bodyRef.current.rotation.x = 0;
      }
  }, [status]);
  
  useEffect(() => {
      const maxLane = Math.floor(laneCount / 2);
      if (Math.abs(lane) > maxLane) {
          setLane(l => Math.max(Math.min(l, maxLane), -maxLane));
      }
  }, [laneCount, lane]);

  const triggerJump = () => {
    const maxJumps = hasDoubleJump ? 2 : 1;
    if (!isJumping.current) {
        audio.playJump(false);
        isJumping.current = true;
        jumpsPerformed.current = 1;
        velocityY.current = JUMP_FORCE;
    } else if (jumpsPerformed.current < maxJumps) {
        audio.playJump(true);
        jumpsPerformed.current += 1;
        velocityY.current = JUMP_FORCE; 
        spinRotation.current = 0; 
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== GameStatus.PLAYING) return;
      const maxLane = Math.floor(laneCount / 2);

      if (e.key === 'ArrowLeft') setLane(l => Math.max(l - 1, -maxLane));
      else if (e.key === 'ArrowRight') setLane(l => Math.min(l + 1, maxLane));
      else if (e.key === 'ArrowUp' || e.key === 'w') triggerJump();
      else if (e.key === ' ' || e.key === 'Enter') {
          activateImmortality();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, laneCount, hasDoubleJump, activateImmortality]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };
    const handleTouchEnd = (e: TouchEvent) => {
        if (status !== GameStatus.PLAYING) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX.current;
        const deltaY = e.changedTouches[0].clientY - touchStartY.current;
        const maxLane = Math.floor(laneCount / 2);

        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
             if (deltaX > 0) setLane(l => Math.min(l + 1, maxLane));
             else setLane(l => Math.max(l - 1, -maxLane));
        } else if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -30) {
            triggerJump();
        } else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
            activateImmortality();
        }
    };
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [status, laneCount, hasDoubleJump, activateImmortality]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    if (status !== GameStatus.PLAYING && status !== GameStatus.SHOP) return;

    // 1. Horizontal Position
    targetX.current = lane * LANE_WIDTH;
    groupRef.current.position.x = THREE.MathUtils.lerp(
        groupRef.current.position.x, 
        targetX.current, 
        delta * 15 
    );

    // 2. Physics (Jump)
    if (isJumping.current) {
        groupRef.current.position.y += velocityY.current * delta;
        velocityY.current -= GRAVITY * delta;

        if (groupRef.current.position.y <= 0) {
            groupRef.current.position.y = 0;
            isJumping.current = false;
            jumpsPerformed.current = 0;
            velocityY.current = 0;
            if (bodyRef.current) bodyRef.current.rotation.x = 0;
        }

        if (jumpsPerformed.current === 2 && bodyRef.current) {
             spinRotation.current -= delta * 15;
             if (spinRotation.current < -Math.PI * 2) spinRotation.current = -Math.PI * 2;
             bodyRef.current.rotation.x = spinRotation.current;
        }
    }

    // Banking
    const xDiff = targetX.current - groupRef.current.position.x;
    groupRef.current.rotation.z = -xDiff * 0.15; 
    
    // 3. Animation
    const time = state.clock.elapsedTime * 25; 
    
    if (!isJumping.current) {
        // Run
        if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(time) * 1.2;
        if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(time + Math.PI) * 1.2;
        // Bob
        if (bodyRef.current) {
            bodyRef.current.position.y = 0.6 + Math.abs(Math.sin(time)) * 0.1;
            bodyRef.current.rotation.x = 0.1; // Lean forward
        }
        // Head Bob
        if (headRef.current) headRef.current.rotation.x = Math.sin(time * 0.5) * 0.2;
        // Wings Flap
        if (leftWingRef.current) leftWingRef.current.rotation.z = 0.2 + Math.sin(time) * 0.1;
        if (rightWingRef.current) rightWingRef.current.rotation.z = -0.2 - Math.sin(time) * 0.1;
    } else {
        // Jump Pose
        if (leftLegRef.current) leftLegRef.current.rotation.x = -0.5;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -0.5;
        if (leftWingRef.current) leftWingRef.current.rotation.z = 1.0; // Flap up
        if (rightWingRef.current) rightWingRef.current.rotation.z = -1.0;
    }

    // Shadow
    if (shadowRef.current) {
        const height = groupRef.current.position.y;
        const scale = Math.max(0.3, 1.2 - (height / 2.5) * 0.5); 
        shadowRef.current.scale.set(scale, scale, scale);
        (shadowRef.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0.1, 0.4 - (height / 2.5) * 0.2);
    }

    // Invincibility
    const showFlicker = isInvincible.current || isImmortalityActive;
    if (showFlicker) {
        if (isInvincible.current) {
             if (Date.now() - lastDamageTime.current > 1500) {
                isInvincible.current = false;
                groupRef.current.visible = true;
             } else {
                groupRef.current.visible = Math.floor(Date.now() / 50) % 2 === 0;
             }
        } 
        if (isImmortalityActive) {
            groupRef.current.visible = true; 
        }
    } else {
        groupRef.current.visible = true;
    }
  });

  useEffect(() => {
     const checkHit = (e: any) => {
        if (isInvincible.current || isImmortalityActive) return;
        audio.playDamage();
        takeDamage();
        isInvincible.current = true;
        lastDamageTime.current = Date.now();
     };
     window.addEventListener('player-hit', checkHit);
     return () => window.removeEventListener('player-hit', checkHit);
  }, [takeDamage, isImmortalityActive]);

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <group ref={bodyRef} position={[0, 0.6, 0]}> 
        
        {/* Rotate 180 degrees to face -Z (Running Direction) */}
        <group rotation={[0, Math.PI, 0]}>
            {/* Body */}
            <mesh castShadow geometry={BODY_GEO} material={bodyMat} />

            {/* Neck & Head */}
            <group position={[0, 0.3, 0.2]} rotation={[-0.2, 0, 0]}>
                <mesh position={[0, 0.15, 0]} geometry={NECK_GEO} material={bodyMat} />
                <group ref={headRef} position={[0, 0.35, 0]}>
                    <mesh castShadow geometry={HEAD_GEO} material={bodyMat} />
                    {/* Beak */}
                    <mesh position={[0, 0, 0.18]} rotation={[1.5, 0, 0]} geometry={BEAK_GEO} material={beakMat} />
                    {/* Wattle */}
                    <mesh position={[0, -0.1, 0.15]} geometry={WATTLE_GEO} material={wattleMat} />
                    {/* Eyes */}
                    <mesh position={[0.1, 0.05, 0.15]} geometry={WATTLE_GEO} scale={0.3}>
                        <meshBasicMaterial color="black" />
                    </mesh>
                    <mesh position={[-0.1, 0.05, 0.15]} geometry={WATTLE_GEO} scale={0.3}>
                        <meshBasicMaterial color="black" />
                    </mesh>
                </group>
            </group>

            {/* Tail Feathers */}
            <group ref={tailRef} position={[0, 0.1, -0.3]} rotation={[0.5, 0, 0]}>
                 {[...Array(5)].map((_, i) => {
                     const angle = (i - 2) * 0.3;
                     // Alternate feather colors
                     const mat = i % 3 === 0 ? featherMat1 : i % 3 === 1 ? featherMat2 : featherMat3;
                     return (
                         <mesh key={i} position={[Math.sin(angle)*0.4, 0.4, Math.cos(angle)*0.1]} rotation={[0, 0, -angle]} geometry={TAIL_FEATHER_GEO} material={mat} />
                     );
                 })}
            </group>

            {/* Wings */}
            <group ref={leftWingRef} position={[-0.35, 0, 0]}>
                <mesh geometry={WING_GEO} material={featherMat2} />
            </group>
            <group ref={rightWingRef} position={[0.35, 0, 0]}>
                <mesh geometry={WING_GEO} material={featherMat2} />
            </group>

            {/* Legs */}
            <group position={[0.15, -0.3, 0]}>
                <group ref={rightLegRef}>
                     <mesh position={[0, -0.2, 0]} geometry={LEG_GEO} material={legMat} />
                     <mesh position={[0, -0.4, 0.05]} geometry={FOOT_GEO} material={legMat} />
                </group>
            </group>
            <group position={[-0.15, -0.3, 0]}>
                <group ref={leftLegRef}>
                     <mesh position={[0, -0.2, 0]} geometry={LEG_GEO} material={legMat} />
                     <mesh position={[0, -0.4, 0.05]} geometry={FOOT_GEO} material={legMat} />
                </group>
            </group>
        </group>

      </group>
      
      <mesh ref={shadowRef} position={[0, 0.02, 0]} rotation={[-Math.PI/2, 0, 0]} geometry={SHADOW_GEO} material={shadowMaterial} />
    </group>
  );
};
